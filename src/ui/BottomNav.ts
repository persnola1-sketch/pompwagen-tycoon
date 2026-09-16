export type NavId = 'shop' | 'workers' | 'quests' | 'orders' | 'map';

interface NavDef {
  id: NavId;
  label: string;
  emoji: string;
}

const ITEMS: NavDef[] = [
  { id: 'shop', label: 'Shop', emoji: '🛒' },
  { id: 'workers', label: 'Workers', emoji: '👷' },
  { id: 'quests', label: 'Quests', emoji: '🎯' },
  { id: 'orders', label: 'Orders', emoji: '📋' },
  { id: 'map', label: 'Map', emoji: '🗺️' },
];

/**
 * The bottom navigation bar: five big touch targets that open the game's
 * panels, each with its own notification badge. One panel is open at a time,
 * and the active tab stays highlighted.
 */
export class BottomNav {
  private el: HTMLElement;
  private badges = new Map<NavId, HTMLElement>();
  onSelect: ((id: NavId) => void) | null = null;

  constructor() {
    this.el = document.createElement('nav');
    this.el.id = 'bottom-nav';
    this.el.className = 'ui';
    this.el.innerHTML = ITEMS.map(
      (i) => `<button data-nav="${i.id}"><span class="nemoji">${i.emoji}<span class="badge" hidden>0</span></span><span class="nlabel">${i.label}</span></button>`,
    ).join('');
    document.body.appendChild(this.el);
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button')) {
      const id = b.dataset.nav as NavId;
      this.badges.set(id, b.querySelector('.badge')!);
      b.addEventListener('click', () => this.onSelect?.(id));
    }
  }

  setBadge(id: NavId, n: number): void {
    const el = this.badges.get(id);
    if (!el) return;
    el.hidden = n <= 0;
    el.textContent = n > 9 ? '9+' : String(n);
  }

  setActive(id: NavId | null): void {
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button')) {
      b.classList.toggle('on', b.dataset.nav === id);
    }
  }
}
