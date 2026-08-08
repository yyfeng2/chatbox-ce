import { Textarea } from '@mantine/core'
import { TestId } from '@shared/automation/testids'
import type React from 'react'
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { useMessageInput } from '@/hooks/useMessageInput'
import * as dom from '../../hooks/dom'

export type MessageInputFieldRef = {
  getValue: () => string
  setValue: (val: string | ((prev: string) => string)) => void
  clearDraft: () => void
  getElement: () => HTMLTextAreaElement | null
}

type MessageInputFieldProps = {
  isNewSession: boolean
  viewportHeight: number
  isReadOnly: boolean
  placeholder: string
  ariaLabel: string
  autoFocus: boolean
  /** Called on every value change (including programmatic setValue). */
  onValueChange: (value: string) => void
  /** Called only on real user typing (onChange), not programmatic setValue. */
  onUserInput?: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void
}

export const MessageInputField = memo(
  forwardRef<MessageInputFieldRef, MessageInputFieldProps>(
    (
      {
        isNewSession,
        viewportHeight,
        isReadOnly,
        placeholder,
        ariaLabel,
        autoFocus,
        onValueChange,
        onUserInput,
        onKeyDown,
        onPaste,
      },
      ref
    ) => {
      const { messageInput, setMessageInput, clearDraft } = useMessageInput('', { isNewSession })
      const inputRef = useRef<HTMLTextAreaElement | null>(null)
      const messageInputRef = useRef(messageInput)
      messageInputRef.current = messageInput

      useEffect(() => {
        onValueChange(messageInput)
      }, [messageInput, onValueChange])

      useImperativeHandle(
        ref,
        () => ({
          getValue: () => messageInputRef.current,
          setValue: (val) => setMessageInput(val),
          clearDraft: () => clearDraft(),
          getElement: () => inputRef.current,
        }),
        [setMessageInput, clearDraft]
      )

      const onChange = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          setMessageInput(event.target.value)
          onUserInput?.()
        },
        [setMessageInput, onUserInput]
      )

      return (
        <Textarea
          unstyled={true}
          styles={{ input: { fontSize: 14 } }}
          classNames={{
            root: 'flex-1',
            wrapper: 'flex-1',
            input:
              'block w-full outline-none border-none px-2 py-1 resize-none bg-transparent text-chatbox-tint-primary leading-6',
          }}
          size="sm"
          id={dom.messageInputID}
          ref={inputRef}
          placeholder={placeholder}
          aria-label={ariaLabel}
          bg="transparent"
          autosize={true}
          minRows={2}
          maxRows={Math.max(4, Math.floor(viewportHeight / 100))}
          value={messageInput}
          autoFocus={autoFocus}
          readOnly={isReadOnly}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          data-testid={TestId.chat.messageInput}
        />
      )
    }
  )
)
