/** Bottom text bubble for tutorial steps. */
export class TutorialOverlay {
  private el: HTMLElement | null = null;
  private hideTimer = 0;

  show(stepNumber: number, total: number, text: string): void {
    this.hide();
    const el = document.createElement('div');
    el.id = 'tutorial';
    el.className = 'ui';
    el.innerHTML = `<div class="step-n"></div><div class="txt"></div>`;
    (el.querySelector('.step-n') as HTMLElement).textContent = stepNumber >= total ? 'Tutorial complete' : `Tutorial ${stepNumber}/${total}`;
    (el.querySelector('.txt') as HTMLElement).textContent = text;
    document.body.appendChild(el);
    this.el = el;
  }

  hideAfter(seconds: number): void {
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), seconds * 1000);
  }

  hide(): void {
    window.clearTimeout(this.hideTimer);
    this.el?.remove();
    this.el = null;
  }
}
