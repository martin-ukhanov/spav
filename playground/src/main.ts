import { Spav } from 'spav-js';

/** Creates a focusable demo button with the given label. */
function makeButton(label: string) {
	const button = document.createElement('button');
	button.className = 'focusable';
	button.textContent = label;
	return button;
}

/** Appends `count` focusable buttons to a container, labelled via `label`. */
function fill(selector: string, count: number, label: (i: number) => string) {
	const container = document.querySelector(selector);
	if (!container) return;
	for (let i = 0; i < count; i++) container.append(makeButton(label(i)));
}

// Dense grid heuristic
fill('#grid-target', 36, (i) => String(i + 1));

// Vertical scroll container
fill('#vscroll-target', 20, (i) => `Row ${i + 1}`);
document.querySelectorAll<HTMLElement>('#vscroll-target .focusable').forEach((el) => {
	el.style.minHeight = '2.5rem';
});

// Horizontal scroll container
const hscroll = document.querySelector('#hscroll-target');
for (let i = 0; i < 20; i++) {
	const button = makeButton(`Card ${i + 1}`);
	button.style.minWidth = '8rem';
	button.style.height = '6rem';
	hscroll?.append(button);
}

// RTL horizontal scroll container
const rtl = document.querySelector('#rtl-target');
for (let i = 0; i < 20; i++) {
	const button = makeButton(`بطاقة ${i + 1}`);
	button.style.minWidth = '8rem';
	button.style.height = '6rem';
	rtl?.append(button);
}

// Nested scroll containers: a horizontal row of vertical scrollers
const nested = document.querySelector('#nested-target');
for (let col = 0; col < 5; col++) {
	const column = document.createElement('div');
	column.className =
		'h-56 w-44 shrink-0 space-y-2 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/50 p-2';
	for (let row = 0; row < 12; row++) {
		const button = makeButton(`${col + 1}.${row + 1}`);
		button.style.minHeight = '2.25rem';
		column.append(button);
	}
	nested?.append(column);
}

// Start Spav and log every focus move for debugging.
const spav = new Spav({
	onFocus({ target, direction }) {
		const label = (target.textContent || target.tagName).trim().slice(0, 40);
		console.log(`[spav] ${direction ?? 'focus'} → ${label}`);
	}
});

// Expose for tinkering from the devtools console.
(window as unknown as { spav: Spav }).spav = spav;

// --- Runtime control panel -------------------------------------------------

function controlPanel() {
	const panel = document.createElement('div');
	panel.setAttribute('data-spav-ignore', '');
	panel.className =
		'fixed bottom-4 right-4 z-[10000] flex w-56 flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs shadow-xl backdrop-blur';

	panel.innerHTML = `
		<div class="font-semibold text-slate-200">Spav controls</div>
		<label class="flex items-center justify-between gap-2">
			<span>Indicator</span><input type="checkbox" id="ctl-indicator" checked />
		</label>
		<label class="flex items-center justify-between gap-2">
			<span>Smooth scroll</span><input type="checkbox" id="ctl-smooth" />
		</label>
		<label class="flex items-center justify-between gap-2">
			<span>Blur on Escape</span><input type="checkbox" id="ctl-blur" checked />
		</label>
		<label class="flex flex-col gap-1">
			<span>Indicator speed: <b id="ctl-speed-val">0.25</b></span>
			<input type="range" id="ctl-speed" min="0.05" max="1" step="0.05" value="0.25" />
		</label>
	`;

	document.body.append(panel);

	const find = <T extends HTMLElement>(id: string) => panel.querySelector(id) as T;

	find<HTMLInputElement>('#ctl-indicator').addEventListener('change', (e) => {
		spav.indicator = (e.target as HTMLInputElement).checked;
	});

	find<HTMLInputElement>('#ctl-smooth').addEventListener('change', (e) => {
		const smooth = (e.target as HTMLInputElement).checked;
		spav.scroll = { behavior: smooth ? 'smooth' : 'auto' };
		spav.scrollIntoView = { behavior: smooth ? 'smooth' : 'auto' };
	});

	find<HTMLInputElement>('#ctl-blur').addEventListener('change', (e) => {
		spav.blurOnEscape = (e.target as HTMLInputElement).checked;
	});

	find<HTMLInputElement>('#ctl-speed').addEventListener('input', (e) => {
		const value = parseFloat((e.target as HTMLInputElement).value);
		find<HTMLElement>('#ctl-speed-val').textContent = value.toFixed(2);
		if (spav.indicator) spav.indicator.speed = value;
	});
}

controlPanel();
