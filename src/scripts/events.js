import { ipcRenderer, remote, shell } from 'electron';
import dock from './dock';
import menus from './menus';
import servers from './servers';
import sidebar from './sidebar';
import tray from './tray';
import webview from './webview';


const { app, getCurrentWindow } = remote;
const { certificate } = remote.require('./background');


const updatePreferences = () => {
	const mainWindow = getCurrentWindow();

	menus.setState({
		showTrayIcon: localStorage.getItem('hideTray') ?
			localStorage.getItem('hideTray') !== 'true' : (process.platform !== 'linux'),
		showUserStatusInTray: (localStorage.getItem('showUserStatusInTray') || 'true') === 'true',
		showFullScreen: mainWindow.isFullScreen(),
		showWindowOnUnreadChanged: localStorage.getItem('showWindowOnUnreadChanged') === 'true',
		showMenuBar: localStorage.getItem('autohideMenu') !== 'true',
		showServerList: localStorage.getItem('sidebar-closed') !== 'true',
	});

	tray.setState({
		showIcon: localStorage.getItem('hideTray') ?
			localStorage.getItem('hideTray') !== 'true' : (process.platform !== 'linux'),
		showUserStatus: (localStorage.getItem('showUserStatusInTray') || 'true') === 'true',
	});
};

const updateServers = () => {
	menus.setState({
		servers: Object.values(servers.hosts)
			.sort((a, b) => (sidebar ? (sidebar.sortOrder.indexOf(a.url) - sidebar.sortOrder.indexOf(b.url)) : 0))
			.map(({ title, url }) => ({ title, url })),
		currentServerUrl: servers.active,
	});
};

const updateWindowState = () => tray.setState({ isMainWindowVisible: getCurrentWindow().isVisible() });

const attachMenusEvents = () => {
	menus.on('quit', () => app.quit());
	menus.on('about', () => ipcRenderer.send('open-about-dialog'));
	menus.on('open-url', (url) => shell.openExternal(url));

	menus.on('add-new-server', () => {
		getCurrentWindow().show();
		sidebar.changeSidebarColor({});
		servers.clearActive();
		webview.showLanding();
	});

	menus.on('select-server', ({ url }) => {
		getCurrentWindow().show();
		servers.setActive(url);
	});

	menus.on('reload-server', ({ ignoringCache = false, clearCertificates = false } = {}) => {
		if (clearCertificates) {
			certificate.clear();
		}

		const activeWebview = webview.getActive();
		if (!activeWebview) {
			return;
		}

		if (ignoringCache) {
			activeWebview.reloadIgnoringCache();
			return;
		}

		activeWebview.reload();
	});

	menus.on('open-devtools-for-server', () => {
		const activeWebview = webview.getActive();
		if (activeWebview) {
			activeWebview.openDevTools();
		}
	});

	menus.on('go-back', () => webview.goBack());
	menus.on('go-forward', () => webview.goForward());

	menus.on('reload-app', () => getCurrentWindow().reload());

	menus.on('toggle-devtools', () => getCurrentWindow().toggleDevTools());

	menus.on('reset-app-data', () => servers.resetAppData());

	menus.on('toggle', (property) => {
		switch (property) {
			case 'showTrayIcon': {
				const previousValue = localStorage.getItem('hideTray') !== 'true';
				const newValue = !previousValue;
				localStorage.setItem('hideTray', JSON.stringify(!newValue));
				break;
			}

			case 'showUserStatusInTray': {
				const previousValue = (localStorage.getItem('showUserStatusInTray') || 'true') === 'true';
				const newValue = !previousValue;
				localStorage.setItem('showUserStatusInTray', JSON.stringify(newValue));
				break;
			}

			case 'showFullScreen': {
				const mainWindow = getCurrentWindow();
				mainWindow.setFullScreen(!mainWindow.isFullScreen());
				break;
			}

			case 'showWindowOnUnreadChanged': {
				const previousValue = localStorage.getItem('showWindowOnUnreadChanged') === 'true';
				const newValue = !previousValue;
				localStorage.setItem('showWindowOnUnreadChanged', JSON.stringify(newValue));
				break;
			}

			case 'showMenuBar': {
				const previousValue = localStorage.getItem('autohideMenu') !== 'true';
				const newValue = !previousValue;
				localStorage.setItem('autohideMenu', JSON.stringify(!newValue));
				break;
			}

			case 'showServerList': {
				sidebar.toggle();
				break;
			}
		}

		updatePreferences();
	});
};

const attachServersEvents = () => {
	servers.on('loaded', () => {
		webview.loaded();
		updateServers();
	});

	servers.on('active-cleared', (hostUrl) => {
		webview.deactiveAll(hostUrl);
		sidebar.deactiveAll(hostUrl);
		updateServers();
	});

	servers.on('active-setted', (hostUrl) => {
		webview.setActive(hostUrl);
		sidebar.setActive(hostUrl);

		try {
			webview.getActive().send('request-sidebar-color');
		} catch (e) {
			console.error(e);
		}

		updateServers();
	});

	servers.on('host-added', (hostUrl) => {
		webview.add(servers.get(hostUrl));
		sidebar.add(servers.get(hostUrl));
		updateServers();
	});

	servers.on('host-removed', (hostUrl) => {
		webview.remove(hostUrl);
		sidebar.remove(hostUrl);
		updateServers();
	});

	servers.on('title-setted', (hostUrl, title) => {
		sidebar.setLabel(hostUrl, title);
		updateServers();
	});
};

const attachSidebarEvents = () => {
	sidebar.on('add-server', () => {
		sidebar.changeSidebarColor({});
		servers.clearActive();
		webview.showLanding();
	});

	sidebar.on('servers-sorted', updateServers);

	sidebar.on('badge-setted', () => {
		const badge = sidebar.getGlobalBadge();
		tray.setState({ badge });
		dock.setState({ badge });
	});

	sidebar.on('reload-server', (hostUrl) => webview.getByUrl(hostUrl).reload());
	sidebar.on('remove-server', (hostUrl) => servers.removeHost(hostUrl));
	sidebar.on('open-devtools-for-server', (hostUrl) => webview.getByUrl(hostUrl).openDevTools());
};

const attachTrayEvents = () => {
	const mainWindow = getCurrentWindow();
	tray.on('created', () => mainWindow.emit('set-state', { hideOnClose: true }));
	tray.on('destroyed', () => mainWindow.emit('set-state', { hideOnClose: false }));
	tray.on('set-main-window-visibility', (visible) => (visible ? mainWindow.show() : mainWindow.hide()));
	tray.on('quit', () => app.quit());
};

const attachWebviewEvents = () => {
	webview.on('ipc-message-unread-changed', (hostUrl, [badge]) => {
		sidebar.setBadge(hostUrl, badge);

		if (typeof badge === 'number' && localStorage.getItem('showWindowOnUnreadChanged') === 'true') {
			const mainWindow = remote.getCurrentWindow();
			if (!mainWindow.isFocused()) {
				mainWindow.once('focus', () => mainWindow.flashFrame(false));
				mainWindow.showInactive();
				mainWindow.flashFrame(true);
			}
		}
	});

	webview.on('ipc-message-user-status-manually-set', (hostUrl, [status]) => {
		tray.setState({ status });
		dock.setState({ status });
	});

	webview.on('ipc-message-sidebar-background', (hostUrl, [color]) => {
		sidebar.changeSidebarColor(color);
	});

	webview.on('dom-ready', (hostUrl) => {
		sidebar.setActive(localStorage.getItem('rocket.chat.currentHost'));
		webview.getActive().send('request-sidebar-color');
		sidebar.setImage(hostUrl);
		if (sidebar.isHidden()) {
			sidebar.hide();
		} else {
			sidebar.show();
		}
	});
};

const attachMainWindowEvents = () => {
	getCurrentWindow().on('hide', updateWindowState);
	getCurrentWindow().on('show', updateWindowState);
};

export default () => {
	window.addEventListener('beforeunload', () => {
		try {
			tray.destroy();
			menus.destroy();
			dock.destroy();
			getCurrentWindow().removeListener('hide', updateWindowState);
			getCurrentWindow().removeListener('show', updateWindowState);
		} catch (error) {
			ipcRenderer.send('log', error);
		}
	});

	window.addEventListener('keydown', (e) => {
		if (e.key === 'Control' || e.key === 'Meta') {
			sidebar.setKeyboardShortcutsVisible(true);
		}
	});

	window.addEventListener('keyup', function(e) {
		if (e.key === 'Control' || e.key === 'Meta') {
			sidebar.setKeyboardShortcutsVisible(false);
		}
	});

	attachMenusEvents();
	attachServersEvents();
	attachSidebarEvents();
	attachTrayEvents();
	attachWebviewEvents();
	attachMainWindowEvents();

	updatePreferences();
	updateServers();
	updateWindowState();
};
