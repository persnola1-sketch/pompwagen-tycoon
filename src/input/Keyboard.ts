/** WASD / arrow key fallback for desktop. */
export class Keyboard {
  private keys = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get x(): number {
    let v = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) v -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) v += 1;
    return v;
  }

  get y(): number {
    let v = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) v -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) v += 1;
    return v;
  }
}
