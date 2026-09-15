import { GameState, SaveData } from './GameState';

const KEY = 'pompwagen-tycoon-save';

export class SaveSystem {
  constructor(private state: GameState) {}

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state.toSave()));
    } catch {
      /* private mode / quota — ignore */
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return false;
      this.state.loadFrom(data);
      return true;
    } catch {
      return false;
    }
  }

  reset(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
}
