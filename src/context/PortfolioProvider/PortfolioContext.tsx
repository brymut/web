import { AssetNamespace, AssetReference, caip2, caip19 } from '@shapeshiftoss/caip'
import {
  convertXpubVersion,
  toRootDerivationPath,
  utxoAccountParams,
} from '@shapeshiftoss/chain-adapters'
import {
  bip32ToAddressNList,
  supportsBTC,
  supportsCosmos,
  supportsETH,
  supportsOsmosis,
} from '@shapeshiftoss/hdwallet-core'
import { ChainTypes, NetworkTypes } from '@shapeshiftoss/types'
import difference from 'lodash/difference'
import head from 'lodash/head'
import isEmpty from 'lodash/isEmpty'
import React, { useCallback, useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useChainAdapters } from 'context/PluginProvider/PluginProvider'
import { useWallet } from 'hooks/useWallet/useWallet'
import {
  AccountSpecifierMap,
  accountSpecifiers,
} from 'state/slices/accountSpecifiersSlice/accountSpecifiersSlice'
import { useGetAssetsQuery } from 'state/slices/assetsSlice/assetsSlice'
import { marketApi, useFindAllQuery } from 'state/slices/marketDataSlice/marketDataSlice'
import { portfolio, portfolioApi } from 'state/slices/portfolioSlice/portfolioSlice'
import { supportedAccountTypes } from 'state/slices/portfolioSlice/portfolioSliceCommon'
import { cosmosChainId } from 'state/slices/portfolioSlice/utils'
import {
  selectAccountSpecifiers,
  selectAssetIds,
  selectAssets,
  selectPortfolioAccounts,
  selectPortfolioAssetIds,
  selectTxHistoryStatus,
  selectTxIds,
  selectTxs,
} from 'state/slices/selectors'
import { stakingDataApi } from 'state/slices/stakingDataSlice/stakingDataSlice'
import { TxId } from 'state/slices/txHistorySlice/txHistorySlice'
import { deserializeUniqueTxId } from 'state/slices/txHistorySlice/utils'
import { useAppSelector } from 'state/store'

/**
 * note - be super careful playing with this component, as it's responsible for asset,
 * market data, and portfolio fetching, and we don't want to over or under fetch data,
 * from unchained, market apis, or otherwise. it's optimized such that it won't unnecessarily
 * render, and is closely related to src/hooks/useAccountSpecifiers/useAccountSpecifiers.ts
 *
 * e.g. unintentionally clearing the portfolio can create obscure bugs that don't manifest
 * for some time as reselect does a really good job of memoizing things
 *
 */
export const PortfolioProvider = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useDispatch()
  const chainAdapter = useChainAdapters()
  const {
    state: { wallet },
  } = useWallet()
  const assetsById = useSelector(selectAssets)
  const assetIds = useSelector(selectAssetIds)

  // keep track of pending tx ids, so we can refetch the portfolio when they confirm
  const [pendingTxIds, setPendingTxIds] = useState<Set<TxId>>(new Set<TxId>())

  // immediately load all assets, before the wallet is even connected,
  // so the app is functional and ready
  useGetAssetsQuery()

  // load top 1000 assets market data
  // this is needed to sort assets by market cap
  // and covers most assets users will have
  useFindAllQuery()
  const accountSpecifiersList = useSelector(selectAccountSpecifiers)

  // once the wallet is connected, reach out to unchained to fetch
  // accounts for each chain/account specifier combination
  useEffect(() => {
    if (isEmpty(accountSpecifiersList)) return
    // clear the old portfolio, we have different non null data, we're switching wallet
    console.info('dispatching portfolio clear action')
    dispatch(portfolio.actions.clear())
    // fetch each account
    accountSpecifiersList.forEach(accountSpecifierMap => {
      // forceRefetch is enabled here to make sure that we always have the latest wallet information
      // it also forces queryFn to run and that's needed for the wallet info to be dispatched
      dispatch(
        portfolioApi.endpoints.getAccount.initiate({ accountSpecifierMap }, { forceRefetch: true }),
      )
    })
  }, [dispatch, accountSpecifiersList])

  /**
   * this was previously known as the useAccountSpecifiers hook
   * this has recently been moved into redux state, as hooks are not singletons,
   * and we needed to call useAccountSpecifiers in multiple places, namely here
   * in the portfolio context, and in the transactions provider
   *
   * this effect now sets this globally in state, and it can be consumed via
   * the selectAccountSpecifiers selector
   *
   * break this at your peril
   */
  useEffect(() => {
    if (!wallet) return
    if (isEmpty(assetsById)) return
    ;(async () => {
      try {
        const supportedChains = chainAdapter.getSupportedChains()
        const acc: AccountSpecifierMap[] = []

        for (const chain of supportedChains) {
          const adapter = chainAdapter.byChain(chain)

          switch (chain) {
            // TODO: Handle Cosmos ChainType here
            case ChainTypes.Ethereum: {
              if (!supportsETH(wallet)) continue
              const pubkey = await adapter.getAddress({ wallet })
              if (!pubkey) continue
              const CAIP2 = caip2.toCAIP2({ chain, network: NetworkTypes.MAINNET })
              acc.push({ [CAIP2]: pubkey.toLowerCase() })
              break
            }
            case ChainTypes.Bitcoin: {
              if (!supportsBTC(wallet)) continue
              const CAIP19 = caip19.toCAIP19({
                chain,
                network: NetworkTypes.MAINNET,
                assetNamespace: AssetNamespace.Slip44,
                assetReference: AssetReference.Bitcoin,
              })
              const bitcoin = assetsById[CAIP19]

              if (!bitcoin) continue
              for (const accountType of supportedAccountTypes.bitcoin) {
                const accountParams = utxoAccountParams(bitcoin, accountType, 0)
                const { bip44Params, scriptType } = accountParams
                const pubkeys = await wallet.getPublicKeys([
                  {
                    coin: adapter.getType(),
                    addressNList: bip32ToAddressNList(toRootDerivationPath(bip44Params)),
                    curve: 'secp256k1',
                    scriptType,
                  },
                ])
                if (!pubkeys?.[0]?.xpub) {
                  throw new Error(`usePubkeys: error getting bitcoin xpub`)
                }
                const pubkey = convertXpubVersion(pubkeys[0].xpub, accountType)

                if (!pubkey) continue
                const CAIP2 = caip2.toCAIP2({ chain, network: NetworkTypes.MAINNET })
                acc.push({ [CAIP2]: pubkey })
              }
              break
            }
            case ChainTypes.Cosmos: {
              if (!supportsCosmos(wallet)) continue
              const pubkey = await adapter.getAddress({ wallet })
              if (!pubkey) continue
              const CAIP2 = caip2.toCAIP2({ chain, network: NetworkTypes.COSMOSHUB_MAINNET })
              acc.push({ [CAIP2]: pubkey })
              break
            }
            case ChainTypes.Osmosis: {
              if (!supportsOsmosis(wallet)) continue
              const pubkey = await adapter.getAddress({ wallet })
              if (!pubkey) continue
              const CAIP2 = caip2.toCAIP2({ chain, network: NetworkTypes.OSMOSIS_MAINNET })
              acc.push({ [CAIP2]: pubkey })
              break
            }
            default:
              break
          }
        }

        dispatch(accountSpecifiers.actions.setAccountSpecifiers(acc))
      } catch (e) {
        console.error('useAccountSpecifiers:getAccountSpecifiers:Error', e)
      }
    })()
  }, [assetsById, chainAdapter, dispatch, wallet])

  const txIds = useSelector(selectTxIds)
  const txsById = useSelector(selectTxs)
  const txHistoryStatus = useSelector(selectTxHistoryStatus)

  /**
   * refetch an account given a newly confirmed txid
   */
  const refetchAccountByTxId = useCallback(
    (txId: TxId) => {
      // the accountSpecifier the tx came from
      const { txAccountSpecifier } = deserializeUniqueTxId(txId)
      // only refetch the specific account for this tx
      const accountSpecifierMap = accountSpecifiersList.reduce((acc, cur) => {
        const [chainId, accountSpecifier] = Object.entries(cur)[0]
        const accountId = `${chainId}:${accountSpecifier}`
        if (accountId === txAccountSpecifier) acc[chainId] = accountSpecifier
        return acc
      }, {})
      const { getAccount } = portfolioApi.endpoints
      dispatch(getAccount.initiate({ accountSpecifierMap }, { forceRefetch: true }))
    },
    [accountSpecifiersList, dispatch],
  )

  const portfolioAccounts = useAppSelector(state => selectPortfolioAccounts(state))

  /**
   * monitor for new pending txs, add them to a set, so we can monitor when they're confirmed
   */
  useEffect(() => {
    // we only want to refetch portfolio if a new tx comes in after we're finished loading
    if (txHistoryStatus !== 'loaded') return
    // don't fire with nothing connected
    if (isEmpty(accountSpecifiers)) return
    // grab the most recent txId
    const txId = head(txIds)!
    // grab the actual tx
    const tx = txsById[txId]
    // always wear protection, or don't it's your choice really
    if (!tx) return

    if (tx.caip2 === cosmosChainId) {
      // TODO: this probably shouldn't belong here, otherwise it will only work after first websocket Tx
      // Is there a better place to move this in so we can load validators right after portfolio accounts are available?
      const validators =
        // TODO: That's a hacky hack during dev, remove me obviously - not a clean nor reliable way to get accountSpecifier
        portfolioAccounts[`cosmos:cosmoshub-4:${tx.address}`]?.validatorIds
      validators?.length &&
        validators.forEach(validatorAddress => {
          // and then use .select() to determine loading state on the presence or not of that validator in the RTK slice
          dispatch(
            stakingDataApi.endpoints.getValidatorData.initiate({
              // TODO: Make me programmatic
              chainId: 'cosmos:cosmoshub-4',
              validatorAddress,
            }),
          )
        })
      // cosmos txs only come in when they're confirmed, so refetch that account immediately
      return refetchAccountByTxId(txId)
    } else {
      /**
       * the unchained getAccount call does not include pending txs in the portfolio
       * add them to a set, and the two effects below monitor the set of pending txs
       */
      if (tx.status === 'pending') setPendingTxIds(new Set([...pendingTxIds, txId]))
    }

    // txsById changes on each tx - as txs have more confirmations
    // pendingTxIds is changed by this effect, so don't create an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txIds, txHistoryStatus, refetchAccountByTxId])

  /**
   * monitor the pending tx ids for when they change to confirmed.
   * when they do change to confirmed, refetch the portfolio for that chain
   * (unchained does not include assets for pending txs)
   */
  useEffect(() => {
    // don't monitor any of this stuff if we're still loading - txsByIds will be thrashing
    if (txHistoryStatus !== 'loaded') return
    if (!pendingTxIds.size) return
    // can't map a set, spread it first
    const confirmedTxIds = [...pendingTxIds].filter(txId => txsById[txId]?.status === 'confirmed')
    // txsById will change often, but we only care that if they've gone from pending -> confirmed
    if (!confirmedTxIds.length) return
    // refetch the account for each newly confirmed tx
    confirmedTxIds.forEach(txId => refetchAccountByTxId(txId))
    // stop monitoring the pending tx ids that have now been confirmed
    setPendingTxIds(new Set([...difference([...pendingTxIds], confirmedTxIds)]))
  }, [pendingTxIds, refetchAccountByTxId, txsById, txHistoryStatus])

  // we only prefetch market data for the top 1000 assets
  // once the portfolio has loaded, check we have market data
  // for more obscure assets, if we don't have it, fetch it
  const portfolioAssetIds = useSelector(selectPortfolioAssetIds)

  // creating a variable to store the intervals in
  const [marketDataIntervalId, setMarketDataIntervalId] = useState<NodeJS.Timer | undefined>()

  // market data pre and refetch management
  useEffect(() => {
    if (!portfolioAssetIds.length) return

    const fetchMarketData = () => {
      portfolioAssetIds.forEach(assetId => {
        dispatch(marketApi.endpoints.findByCaip19.initiate(assetId, { forceRefetch: true }))
      })
    }

    // do this the first time once
    fetchMarketData()

    // clear the old timer
    if (marketDataIntervalId) {
      clearInterval(marketDataIntervalId)
      setMarketDataIntervalId(undefined)
    }

    const MARKET_DATA_REFRESH_INTERVAL = 1000 * 60 * 2 // two minutes
    setMarketDataIntervalId(setInterval(fetchMarketData, MARKET_DATA_REFRESH_INTERVAL))

    // marketDataIntervalId causes infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioAssetIds, setMarketDataIntervalId, dispatch])

  // If the assets aren't loaded, then the app isn't ready to render
  // This fixes issues with refreshes on pages that expect assets to already exist
  return assetIds.length ? <>{children}</> : <></>
}
