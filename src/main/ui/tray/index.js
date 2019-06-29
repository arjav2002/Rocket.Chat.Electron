import { app, Menu, systemPreferences, Tray } from 'electron';
import { t } from 'i18next';
import { getStore } from '../../store';
import { getTrayIconImage } from '../icons';
import { showMainWindow, hideMainWindow } from '../../../store/actions';
import { connect } from '../../../utils/store';


let props = {
	badge: null,
	windowVisible: true,
	visible: false,
};

let trayIcon = null;
let darwinThemeSubscriberId = null;

const getIconTitle = ({ badge }) => (Number.isInteger(badge) ? String(badge) : '');

const getIconTooltip = ({ badge }) => {
	const appName = app.getName();

	if (badge === '•') {
		return t('tray.tooltip.unreadMessage', { appName });
	}

	if (Number.isInteger(badge)) {
		return t('tray.tooltip.unreadMention', { appName, count: badge });
	}

	return t('tray.tooltip.noUnreadMessage', { appName });
};

const createContextMenuTemplate = ({ windowVisible, onClickActivate, onClickQuit }) => ([
	{
		label: !windowVisible ? t('tray.menu.show') : t('tray.menu.hide'),
		click: () => onClickActivate(windowVisible),
	},
	{
		label: t('tray.menu.quit'),
		click: () => onClickQuit(),
	},
]);

const createIcon = () => {
	const { badge, windowVisible, onClickActivate } = props;

	const image = getTrayIconImage({ badge });

	if (trayIcon) {
		trayIcon.setImage(image);
		return;
	}

	trayIcon = new Tray(image);

	if (process.platform === 'darwin') {
		darwinThemeSubscriberId = systemPreferences.subscribeNotification('AppleInterfaceThemeChangedNotification', () => {
			trayIcon.setImage(getTrayIconImage({ badge }));
		});
	}

	trayIcon.on('click', () => onClickActivate(windowVisible));
	trayIcon.on('right-click', (event, bounds) => trayIcon.popUpContextMenu(undefined, bounds));
};

const destroyIcon = () => {
	if (!trayIcon) {
		return;
	}

	if (process.platform === 'darwin' && darwinThemeSubscriberId) {
		systemPreferences.unsubscribeNotification(darwinThemeSubscriberId);
		darwinThemeSubscriberId = null;
	}

	trayIcon.destroy();
	trayIcon = null;
};

const render = () => {
	if (!props.visible) {
		destroyIcon();
		return;
	}

	createIcon();

	trayIcon.setToolTip(getIconTooltip(props));

	if (process.platform === 'darwin') {
		trayIcon.setTitle(getIconTitle(props));
	}

	const template = createContextMenuTemplate(props);
	const menu = Menu.buildFromTemplate(template);
	trayIcon.setContextMenu(menu);
};

const setProps = (newProps) => {
	props = newProps;
	render();
};

const mapStateToProps = ({
	preferences: {
		hasTray,
	},
	servers,
	mainWindow: {
		isHidden,
	},
}) => {
	const badges = servers.map(({ badge }) => badge);
	const mentionCount = (
		badges
			.filter((badge) => Number.isInteger(badge))
			.reduce((sum, count) => sum + count, 0)
	);
	const badge = mentionCount || (badges.some((badge) => !!badge) && '•') || null;

	return ({
		badge,
		windowVisible: !isHidden,
		visible: hasTray,
		onClickActivate: (windowVisible) => {
			Promise.resolve(getStore())
				.then((store) => store.dispatch(windowVisible ? hideMainWindow() : showMainWindow()));
		},
		onClickQuit: () => app.quit(),
	});
};

let disconnect;

const mount = () => {
	render();

	disconnect = connect(getStore(), mapStateToProps)(setProps);
};

const unmount = () => {
	disconnect();
	destroyIcon();
};

export const tray = {
	mount,
	unmount,
};
