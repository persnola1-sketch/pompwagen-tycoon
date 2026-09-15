/** Bottom text bubble for tutorial steps. */
export class TutorialOverlay {
  private el: HTMLElement | null = null;

  show(stepNumber: number, total: number, text: string): void {
    this.hide();
    const el = document.createElement('div');
    el.id = 'tutorial';
    el.className = 'ui';
    el.innerHTML = `<div class="step-n"></div><div class="txt"></div>`;
    (el.querySelector('.step-n') as HTMLElement).textContent = `Tutorial ${stepNumber}/${total}`;
    (el.querySelector('.txt') as HTMLElement).textContent = text;
    document.body.appendChild(el);
    this.el = el;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }
}
