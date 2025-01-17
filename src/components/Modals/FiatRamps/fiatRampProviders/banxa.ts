import { adapters } from '@shapeshiftoss/caip'

import { FiatRampAction } from '../FiatRampsCommon'
import type { CreateUrlProps } from '../types'

export const createBanxaUrl = ({ assetId, address, action }: CreateUrlProps): string => {
  const asset = adapters.assetIdToBanxaTicker(assetId)
  if (!asset) throw new Error('Asset not supported by Banxa')
  const BANXA_BASE_URL = new URL('https://shapeshift.banxa.com/')

  const params = new URLSearchParams()
  /**
   * note (0xdef1cafe): as of 2022/05/12 - USD for sell is not supported
   * and will default to whatever local currency is available
   * vendor problem - nothing we can do
   */
  params.set('fiatType', 'USD')
  params.set('coinType', asset)
  params.set('walletAddress', address)
  /**
   * select the blockchain from asset and pass it to the banxa,
   * since some Banxa assets could be on multiple chains and their default
   * chain won't be exactly the same as ours.
   */
  params.set('blockchain', adapters.getBanxaBlockchainFromBanxaAssetTicker(asset))
  /**
   * based on https://docs.banxa.com/docs/referral-method
   * if sellMode query parameter is not passed `buyMode` will be used by default
   */
  params.set(action === FiatRampAction.Sell ? 'sellMode' : 'buyMode', '')

  return `${BANXA_BASE_URL.toString()}?${params.toString()}`
}
