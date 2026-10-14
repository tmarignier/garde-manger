import { errorMessage, getHealth, getSession, logOut, setUnauthorizedHandler } from './api.ts';
import type { User } from '../shared/types.ts';
import { h } from './dom.ts';
import { accountView } from './views/account.ts';
import { loginView } from './views/login.ts';
import { setupView } from './views/setup.ts';
import { shoppingView } from './views/shopping.ts';
import { stockView } from './views/stock.ts';
import { usersView } from './views/users.ts';

// Screens of the logged-in app, chosen by the URL hash. The main ones are
// linked at the top, the account ones in the footer.
const pages = {
  stock: { hash: '#/', label: 'Stock' },
  shopping: { hash: '#/shopping-list', label: 'Courses' },
  account: { hash: '#/account', label: 'Mon compte' },
  users: { hash: '#/users', label: 'Comptes' },
} as const;

type Page = keyof typeof pages;

const mainPages: readonly Page[] = ['stock', 'shopping'];
const accountPages: readonly Page[] = ['account', 'users'];

function currentPage(user: User): Page {
  if (location.hash === pages.shopping.hash) {
    return 'shopping';
  }
  if (location.hash === pages.account.hash) {
    return 'account';
  }
  if (location.hash === pages.users.hash && user.isAdmin) {
    return 'users';
  }
  return 'stock';
}

function pageView(page: Page, user: User): HTMLElement {
  switch (page) {
    case 'stock':
      return stockView();
    case 'shopping':
      return shoppingView();
    case 'account':
      return accountView(user);
    case 'users':
      return usersView(user);
  }
}

function pageLinks(keys: readonly Page[], current: Page, user: User): HTMLAnchorElement[] {
  return keys
    .filter((key) => key !== 'users' || user.isAdmin)
    .map((key) => h('a', { href: pages[key].hash, 'aria-current': key === current ? 'page' : undefined }, pages[key].label));
}

function createApp(root: HTMLElement, accountLinks: HTMLElement | null): void {
  let user: User | null = null;

  function show(...content: Node[]): void {
    root.replaceChildren(...content);
    accountLinks?.replaceChildren();
  }

  function showLoggedIn(loggedIn: User): void {
    user = loggedIn;
    const page = currentPage(loggedIn);
    const logoutButton = h('button', { type: 'button', class: 'link' }, 'Se déconnecter');
    logoutButton.addEventListener('click', () => {
      void logOut()
        .catch(() => {})
        .then(showLogin);
    });
    show(h('nav', { class: 'main-nav' }, ...pageLinks(mainPages, page, loggedIn)), pageView(page, loggedIn));
    accountLinks?.replaceChildren(...pageLinks(accountPages, page, loggedIn), logoutButton);
  }

  function showLogin(): void {
    user = null;
    show(loginView(showLoggedIn));
  }

  async function start(): Promise<void> {
    show(h('p', { class: 'message' }, 'Chargement…'));
    try {
      const session = await getSession();
      if (session.user !== null) {
        showLoggedIn(session.user);
      } else if (session.setupRequired) {
        show(setupView(showLoggedIn, () => void start()));
      } else {
        showLogin();
      }
    } catch (error) {
      console.error(error);
      const retry = h('button', { type: 'button' }, 'Réessayer');
      retry.addEventListener('click', () => void start());
      show(h('p', { class: 'message', 'data-state': 'error' }, errorMessage(error)), retry);
    }
  }

  setUnauthorizedHandler(showLogin);
  window.addEventListener('hashchange', () => {
    if (user !== null) {
      showLoggedIn(user);
    }
  });
  void start();
}

// The footer stays empty when the server cannot be reached: the main screen
// already says so.
async function showVersion(element: HTMLElement): Promise<void> {
  const { version } = await getHealth();
  element.textContent = `Version ${version}`;
}

const version = document.querySelector<HTMLElement>('#version');
if (version !== null) {
  void showVersion(version).catch(() => {});
}

const root = document.querySelector<HTMLElement>('#app');
if (root !== null) {
  createApp(root, document.querySelector<HTMLElement>('#account-links'));
}
