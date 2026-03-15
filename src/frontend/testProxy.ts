import { applySmartQuotes } from './utils/textUtils';

export function setupSmartQuotesProxy() {
  document.addEventListener(
    'input',
    (e) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'TEXTAREA' ||
        (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'text')
      ) {
        const input = target as HTMLInputElement | HTMLTextAreaElement;
        const oldVal = input.value;
        const newVal = applySmartQuotes(oldVal);
        if (newVal !== oldVal) {
          const start = input.selectionStart;
          const end = input.selectionEnd;

          // Use the native setter to bypass React's value tracking
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set;

          if (target.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
            nativeTextareaValueSetter.call(input, newVal);
          } else if (target.tagName === 'INPUT' && nativeInputValueSetter) {
            nativeInputValueSetter.call(input, newVal);
          } else {
            input.value = newVal;
          }

          input.setSelectionRange(start, end);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    },
    { capture: true }
  );
}
