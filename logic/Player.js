export class Player {
  constructor(id, name, chips = 1000) {
    this.id = id;
    this.name = name;
    this.chips = chips;
    this.cards = [];
    this.status = 'waiting'; 
    this.bet = 0;
    this.position = -1;
    this.hasActed = false; // Suivi des actions
  }

  resetForNewHand() {
    this.cards = [];
    this.bet = 0;
    this.hasActed = false; // Réinitialisation
    if (this.chips > 0) {
      this.status = 'active';
    }
  }
}
