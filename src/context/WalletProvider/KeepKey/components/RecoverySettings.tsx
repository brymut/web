import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  ModalBody,
  ModalHeader,
  Switch,
  useColorModeValue,
} from '@chakra-ui/react'
import { useState } from 'react'
import { useTranslate } from 'react-polyglot'
import { useHistory } from 'react-router-dom'
import { Radio, RadioOption } from 'components/Radio/Radio'
import { Text } from 'components/Text'
import { KeepKeyRoutes } from 'context/WalletProvider/routes'
import { useWallet } from 'hooks/useWallet/useWallet'

export const VALID_ENTROPY = [128, 192, 256] as const
export type Entropy = typeof VALID_ENTROPY[number]

export enum SentenceLength {
  TwelveWords = VALID_ENTROPY[0],
  EighteenWords = VALID_ENTROPY[1],
  TwentyFourWords = VALID_ENTROPY[2],
}

const sentenceLengthOptions: readonly RadioOption<SentenceLength>[] = Object.freeze([
  {
    value: SentenceLength.TwelveWords,
    label: ['modals.keepKey.recoverySettings.wordCount', { wordCount: '12' }],
  },
  {
    value: SentenceLength.EighteenWords,
    label: ['modals.keepKey.recoverySettings.wordCount', { wordCount: '18' }],
  },
  {
    value: SentenceLength.TwentyFourWords,
    label: ['modals.keepKey.recoverySettings.wordCount', { wordCount: '24' }],
  },
])

export const KeepKeyRecoverySettings = () => {
  const translate = useTranslate()
  const history = useHistory()
  const [useRecoveryPassphrase, setUseRecoveryPassphrase] = useState(false)
  const [sentenceLengthSelection, setSentenceLengthSelection] = useState(
    String(SentenceLength.TwelveWords),
  )
  const { setDeviceState } = useWallet()

  const grayTextColor = useColorModeValue('gray.900', 'gray.400')
  const grayBackgroundColor = useColorModeValue('gray.100', 'gray.700')

  const isValidEntropy = (length: number | undefined): length is Entropy | undefined => {
    return VALID_ENTROPY.some(e => e === length)
  }

  const handleSubmit = async () => {
    const entropy = parseInt(sentenceLengthSelection)
    const entropyTyped = isValidEntropy(entropy) ? entropy : VALID_ENTROPY[0]
    setDeviceState({
      stagedPassphrase: useRecoveryPassphrase,
      stagedEntropy: entropyTyped,
    })
    history.push(KeepKeyRoutes.NewLabel)
  }

  const handleSentenceLengthSelection = (value: string) => {
    setSentenceLengthSelection(value)
  }

  const handlePassphraseToggle = () => {
    setUseRecoveryPassphrase(current => !current)
  }

  const radioButtonProps = {
    width: 'full',
    pt: 5,
    pb: 5,
    mb: 8,
    borderRadius: 'none',
    _first: {
      borderTopLeftRadius: 'lg',
      borderBottomLeftRadius: 'lg',
    },
    bg: grayBackgroundColor,
    color: grayTextColor,
    _last: {
      borderTopRightRadius: 'lg',
      borderBottomRightRadius: 'lg',
    },
    _checked: {
      bg: 'blue.500',
      color: 'white',
    },
  }

  const buttonGroupProps = {
    borderRadius: 'lg',
    display: 'flex',
    width: 'full',
    spacing: '0',
  }

  return (
    <>
      <ModalHeader>
        <Text translation={'modals.keepKey.recoverySettings.header'} />
      </ModalHeader>
      <ModalBody>
        <Text
          color={grayTextColor}
          fontWeight='bold'
          fontSize='md'
          translation={'modals.keepKey.recoverySettings.sentenceLengthLabel'}
          mb={2}
        />
        <Radio
          onChange={handleSentenceLengthSelection}
          options={sentenceLengthOptions.map(k => {
            return { value: String(k.value), label: k.label }
          })}
          defaultValue={sentenceLengthSelection}
          radioProps={radioButtonProps}
          buttonGroupProps={buttonGroupProps}
        />
        <Text
          color={grayTextColor}
          fontWeight='bold'
          fontSize='md'
          translation={'modals.keepKey.recoverySettings.recoveryPassphraseLabel'}
          mb={2}
        />
        <FormControl
          display='flex'
          alignItems='center'
          mb={3}
          background={grayBackgroundColor}
          padding={3}
          borderRadius='lg'
        >
          <Flex flexGrow={1}>
            <FormLabel color={grayTextColor} htmlFor='recovery-passphrase' mb='0'>
              {translate('modals.keepKey.recoverySettings.recoveryPassphraseToggle')}
            </FormLabel>
          </Flex>
          <Switch
            id='pin-caching'
            isChecked={useRecoveryPassphrase}
            onChange={handlePassphraseToggle}
          />
        </FormControl>
        <Text
          color={grayTextColor}
          fontWeight='medium'
          fontSize='sm'
          translation={'modals.keepKey.recoverySettings.recoveryPassphraseDescription'}
          mb={6}
        />
        <Button isFullWidth size='lg' colorScheme='blue' onClick={handleSubmit} mb={3}>
          <Text translation={'modals.keepKey.recoverySettings.button'} />
        </Button>
      </ModalBody>
    </>
  )
}
