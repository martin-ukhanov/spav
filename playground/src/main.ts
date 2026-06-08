import { Spav } from 'spav-js';

// Populate the scrollers with enough tiles to force overflow.
const horizontal = document.querySelector<HTMLDivElement>('#scroller-h')!;
const vertical = document.querySelector<HTMLDivElement>('#scroller-v')!;

for (let i = 1; i <= 12; i++) {
	const h = document.createElement('button');
	h.className = 'tile';
	h.textContent = `H ${i}`;
	horizontal.append(h);

	const v = document.createElement('button');
	v.className = 'tile';
	v.style.minWidth = 'auto';
	v.style.height = '48px';
	v.textContent = `V ${i}`;
	vertical.append(v);
}

const spav = new Spav({
	cursor: { autoRaf: false, matchBorderRadius: true },
	scroll: { behavior: 'smooth' },
	scrollIntoView: { behavior: 'smooth', block: 'nearest', inline: 'nearest' },
	onFocus: ({ target, direction }) => {
		console.log('focus', { target, direction });
	}
});

const raf: FrameRequestCallback = (time) => {
	spav.cursor?.raf(time);
	requestAnimationFrame(raf);
};

requestAnimationFrame(raf);

// Modal: trap navigation by making everything else inert while it's open.
const modal = document.querySelector<HTMLDivElement>('#modal')!;
const openButton = document.querySelector<HTMLButtonElement>('#open-modal')!;
const closeButton = document.querySelector<HTMLButtonElement>('#close-modal')!;
const backdrop = Array.from(document.body.children).filter((el) => el !== modal);

function openModal() {
	modal.setAttribute('data-open', '');
	backdrop.forEach((el) => el.setAttribute('inert', ''));
	spav.focus(modal.querySelector('input')!);
}

function closeModal() {
	modal.removeAttribute('data-open');
	backdrop.forEach((el) => el.removeAttribute('inert'));
	openButton.focus();
}

openButton.addEventListener('click', openModal);
closeButton.addEventListener('click', closeModal);

// Spav's own Escape handler blurs the active element; also close the modal on Escape.
window.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && modal.hasAttribute('data-open')) closeModal();
});
