import { getHealth } from './api.ts';

async function showServerStatus(element: HTMLElement): Promise<void> {
  try {
    await getHealth();
    element.textContent = 'Le serveur fonctionne.';
    element.dataset['state'] = 'ok';
  } catch (error) {
    console.error(error);
    element.textContent = 'Impossible de joindre le serveur.';
    element.dataset['state'] = 'error';
  }
}

const statusElement = document.querySelector<HTMLElement>('#server-status');
if (statusElement !== null) {
  void showServerStatus(statusElement);
}
