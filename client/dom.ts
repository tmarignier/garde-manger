// Small helpers to build the interface without a framework.

type Child = Node | string | null | false;
type Attributes = Record<string, string | boolean | undefined>;

// Creates an element. Boolean attributes are added when true; event handlers
// are attached with `on` afterwards.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === true) {
      element.setAttribute(name, '');
    } else if (typeof value === 'string') {
      element.setAttribute(name, value);
    }
  }
  for (const child of children) {
    if (child !== null && child !== false) {
      element.append(child);
    }
  }
  return element;
}

// A labelled form field.
export function field(label: string, input: HTMLInputElement): HTMLLabelElement {
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

// A paragraph that shows the outcome of a form, empty until used.
export function messageLine(): { element: HTMLParagraphElement; show: (text: string, kind?: 'error' | 'ok') => void } {
  const element = h('p', { class: 'message', role: 'status' });
  return {
    element,
    show(text, kind = 'error') {
      element.textContent = text;
      element.dataset['state'] = kind;
    },
  };
}

// Disables a form while its request runs, so it is not sent twice.
export async function whileSubmitting(form: HTMLFormElement, action: () => Promise<void>): Promise<void> {
  const controls = Array.from(form.elements).filter(
    (element): element is HTMLInputElement | HTMLButtonElement =>
      element instanceof HTMLInputElement || element instanceof HTMLButtonElement,
  );
  for (const control of controls) {
    control.disabled = true;
  }
  try {
    await action();
  } finally {
    for (const control of controls) {
      control.disabled = false;
    }
  }
}
