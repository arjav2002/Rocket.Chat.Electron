import { nativeImage, TouchBar, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import i18n from '../i18n';
import { connect, store } from '../store';
import { showServer, formatButtonTouched } from '../store/actions';
const {
	TouchBarButton,
	TouchBarLabel,
	TouchBarSegmentedControl,
	TouchBarScrubber,
	TouchBarPopover,
} = TouchBar;


let props = {
	mainWindow: null,
	servers: [],
	activeServerUrl: null,
};

const events = new EventEmitter();

let isUsingSegmentedControl;
let selectServerControl;

const createSegmentedControl = () => (
	new TouchBarSegmentedControl({
		segmentStyle: 'separated',
		segments: props.servers.map((server) => ({ label: server.title, server })),
		selectedIndex: props.servers.findIndex(({ url }) => url === props.activeServerUrl),
		change: (index) => props.onSelectServer(props.servers[index].url),
	})
);

const createScrubber = () => (
	new TouchBarScrubber({
		items: props.servers.map((server) => ({ label: server.title, server })),
		highlight: (index) => props.onSelectServer(props.servers[index].url),
		selectedStyle: 'background',
		showArrowButtons: true,
		mode: 'fixed',
	})
);

const createTouchBar = (selectServerControl) => (
	new TouchBar({
		items: [
			new TouchBarPopover({
				label: i18n.__('touchBar.selectServer'),
				items: new TouchBar({
					items: [
						new TouchBarLabel({ label: i18n.__('touchBar.selectServer') }),
						selectServerControl,
					],
				}),
			}),
			new TouchBarLabel({ label: i18n.__('touchBar.formatting') }),
			...(
				['bold', 'italic', 'strike', 'inline_code', 'multi_line']
					.map((buttonId) => new TouchBarButton({
						icon: nativeImage.createFromPath(`${ __dirname }/public/images/touch-bar/${ buttonId }.png`),
						click: () => props.onTouchFormatButton(buttonId),
					}))
			),
		],
	})
);

const render = () => {
	if (process.platform !== 'darwin') {
		return;
	}

	const { mainWindow, servers, activeServerUrl } = props;
	const serverTitlesLength = servers.reduce((length, { url, title }) => length + (title || url).length, 0);
	const maxLengthForSegmentsControl = 76 - i18n.__('touchBar.selectServer').length;
	const shouldUseSegmentedControl = serverTitlesLength <= maxLengthForSegmentsControl;

	if (isUsingSegmentedControl !== shouldUseSegmentedControl) {
		selectServerControl = shouldUseSegmentedControl ? createSegmentedControl(props) : createScrubber(props);
		mainWindow.setTouchBar(createTouchBar(selectServerControl));
		isUsingSegmentedControl = shouldUseSegmentedControl;
	}

	if (isUsingSegmentedControl) {
		selectServerControl.segments = servers.map((server) => ({ label: server.title, server }));
		selectServerControl.selectedIndex = servers.findIndex(({ url }) => url === activeServerUrl);
	} else {
		selectServerControl.items = servers.map((server) => ({ label: server.title, server }));
	}
};

const setProps = (newProps) => {
	props = newProps;
	render();
};

const mapStateToProps = ({
	mainWindow: {
		id,
	},
	servers,
	view,
}) => ({
	mainWindow: BrowserWindow.fromId(id),
	servers,
	activeServerUrl: view.url,
	onSelectServer: (url) => store.dispatch(showServer(url)),
	onTouchFormatButton: (buttonId) => store.dispatch(formatButtonTouched(buttonId)),
});

let disconnect;

const mount = () => {
	if (process.platform !== 'darwin') {
		return;
	}

	disconnect = connect(mapStateToProps)(setProps);
};

const unmount = () => {
	if (process.platform !== 'darwin') {
		return;
	}

	disconnect();

	events.removeAllListeners();
	props.mainWindow.setTouchBar(null);
	isUsingSegmentedControl = false;
	selectServerControl = null;
};

export const touchBar = Object.assign(events, {
	mount,
	unmount,
});
