import { Player } from './Player.js';
import { HandEvaluator } from './HandEvaluator.js';

export class Table {
  constructor(id, config = {}) {
    this.id = id;
    this.maxPlayers = config.maxPlayers || 6;
    this.minBuyIn = config.minBuyIn || 400;
    this.smallBlind = config.smallBlind || 10;
    this.bigBlind = config.bigBlind || 20;
    
    this.players = []; 
    this.gameState = 'waiting'; 
    this.deck = [];
    this.communityCards = [];
    this.pots = []; // { amount: 0, eligiblePlayerIds: [] }
    this.dealerIndex = 0;
    this.currentPlayerIndex = -1;
    this.currentPhase = 'pre-flop';
    this.onUpdate = null;
    this.onHandEnd = null; // Callback pour persister en DB
    this.winnerInfo = null;
    this.turnTimer = null;
    this.currentBet = this.bigBlind; 
    this.previousBet = 0;
  }

  setUpdateCallback(cb) {
    this.onUpdate = cb;
  }

  setHandEndCallback(cb) {
    this.onHandEnd = cb;
  }

  notify() {
    if (this.onUpdate) this.onUpdate();
  }

  startTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    
    this.turnTimer = setTimeout(() => {
      const activePlayer = this.players[this.currentPlayerIndex];
      if (activePlayer && this.gameState === 'playing') {
        console.log(`Timer écoulé pour ${activePlayer.name}, auto-fold.`);
        this.handleAction(activePlayer.id, 'fold');
        this.notify();
      }
    }, 15000); // 15 secondes
  }

  addPlayer(id, name, chips) {
    if (this.players.length >= this.maxPlayers) return { error: 'Table pleine' };
    const player = new Player(id, name, chips);
    
    const occupiedPositions = this.players.map(p => p.position);
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!occupiedPositions.includes(i)) {
        player.position = i;
        break;
      }
    }
    
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    const playerIndex = this.players.findIndex(p => p.id === id);
    if (playerIndex === -1) return null;
    
    const player = this.players[playerIndex];
    const chipsToReturn = player.chips + (player.bet || 0);
    const playerName = player.name;

    this.players.splice(playerIndex, 1);
    
    if (this.players.length < 2) {
      this.gameState = 'waiting';
    }
    
    return { name: playerName, chips: chipsToReturn };
  }

  createDeck() {
    const suits = ['h', 'd', 'c', 's'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    this.deck = [];
    for (let suit of suits) {
      for (let value of values) {
        this.deck.push({ suit, value });
      }
    }
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  startHand() {
    if (this.players.length < 2) return { error: 'Pas assez de joueurs' };
    
    this.gameState = 'playing';
    this.currentPhase = 'pre-flop';
    this.communityCards = [];
    this.pots = [];
    this.currentBet = this.bigBlind;
    this.previousBet = 0;
    this.winnerInfo = null;
    
    this.createDeck();
    this.shuffleDeck();
    
    this.players.forEach(p => {
      p.resetForNewHand();
      p.lastAction = null;
      if (p.chips > 0) {
        p.cards = [this.deck.pop(), this.deck.pop()];
        p.status = 'active';
      } else {
        p.status = 'out';
      }
    });

    const activePlayers = this.players.filter(p => p.status === 'active');
    if (activePlayers.length < 2) {
        this.gameState = 'waiting';
        return { error: 'Pas assez de joueurs avec des jetons' };
    }

    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    // Find next active players for blinds
    let sbIdx = (this.dealerIndex + 1) % this.players.length;
    while (this.players[sbIdx].status !== 'active') sbIdx = (sbIdx + 1) % this.players.length;
    
    let bbIdx = (sbIdx + 1) % this.players.length;
    while (this.players[bbIdx].status !== 'active') bbIdx = (bbIdx + 1) % this.players.length;

    this.postBlind(this.players[sbIdx], this.smallBlind);
    this.postBlind(this.players[bbIdx], this.bigBlind);
    
    this.currentPlayerIndex = (bbIdx + 1) % this.players.length;
    while (this.players[this.currentPlayerIndex].status !== 'active') {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }

    this.startTurnTimer();
    return { success: true };
  }

  postBlind(player, amount) {
    const actualAmount = Math.min(player.chips, amount);
    player.chips -= actualAmount;
    player.bet = actualAmount;
    if (player.chips === 0) player.status = 'all-in';
  }

  handleAction(playerId, action, amount = 0) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return { error: "Joueur non trouvé" };
    if (player.id !== this.players[this.currentPlayerIndex]?.id) return { error: "Ce n'est pas votre tour" };

    switch (action) {
      case 'fold':
        player.status = 'folded';
        player.lastAction = 'fold';
        break;
      case 'check':
        if (player.bet < this.currentBet) return { error: "Vous ne pouvez pas checker" };
        player.hasActed = true;
        player.lastAction = 'check';
        break;
      case 'call':
        const callAmount = this.currentBet - player.bet;
        if (callAmount >= player.chips) {
          player.bet += player.chips;
          player.chips = 0;
          player.status = 'all-in';
          player.lastAction = 'all-in';
        } else {
          player.chips -= callAmount;
          player.bet += callAmount;
          player.lastAction = 'call';
        }
        player.hasActed = true;
        break;
      case 'raise':
        const raiseTotal = amount;
        const minRaise = this.currentBet + Math.max(this.bigBlind, this.currentBet - (this.previousBet || 0));
        
        if (raiseTotal < minRaise && raiseTotal < player.chips + player.bet) {
             return { error: `Relance insuffisante. Minimum: ${minRaise} MGA` };
        }
        
        const amountToAdd = raiseTotal - player.bet;
        if (amountToAdd > player.chips) return { error: "Pas assez de jetons" };

        this.previousBet = this.currentBet;
        player.chips -= amountToAdd;
        player.bet = raiseTotal;
        this.currentBet = raiseTotal;
        player.lastAction = 'raise';
        
        if (player.chips === 0) {
            player.status = 'all-in';
            player.lastAction = 'all-in';
        }
        
        // Reset hasActed for others
        this.players.forEach(p => {
          if (p.status === 'active' && p.id !== player.id) p.hasActed = false;
        });
        player.hasActed = true;
        break;
      case 'all-in':
        const allInAmount = player.chips; // Amount player has remaining
        player.bet += allInAmount;
        player.chips = 0;
        player.status = 'all-in';
        player.lastAction = 'all-in';
        // If all-in amount is greater than current bet, it becomes the new current bet
        if (player.bet > this.currentBet) {
          this.currentBet = player.bet;
          // Reset hasActed for other active players since there's a new bet to match
          this.players.forEach(p => {
            if (p.status === 'active' && p.id !== player.id) p.hasActed = false;
          });
        }
        player.hasActed = true;
        break;
    }

    this.moveToNextPlayer();
    return { success: true };
  }

  moveToNextPlayer() {
    const activePlayers = this.players.filter(p => p.status === 'active');
    const nonFoldedPlayers = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');

    if (nonFoldedPlayers.length === 1) {
      this.collectBets();
      this.finishHand(nonFoldedPlayers[0]);
      return;
    }

    // Check if betting round is over
    const allMatched = nonFoldedPlayers.every(p => p.status === 'all-in' || (p.bet === this.currentBet && p.hasActed));
    
    if (allMatched) {
      this.collectBets();
      this.nextPhase();
      return;
    }

    let nextIndex = (this.currentPlayerIndex + 1) % this.players.length;
    while (this.players[nextIndex].status !== 'active') {
      nextIndex = (nextIndex + 1) % this.players.length;
    }
    this.currentPlayerIndex = nextIndex;
    this.startTurnTimer();
    this.notify();
  }

  collectBets() {
    // Collect all bets from players and create/update pots
    const contributors = this.players.filter(p => p.bet > 0).sort((a, b) => a.bet - b.bet);
    
    while (contributors.length > 0) {
      const minBet = contributors[0].bet;
      const potAmount = minBet * contributors.length;
      const eligiblePlayerIds = contributors
        .filter(p => p.status !== 'folded')
        .map(p => p.id);

      // Try to merge with last pot if eligible players are the same
      const lastPot = this.pots[this.pots.length - 1];
      if (lastPot && JSON.stringify(lastPot.eligiblePlayerIds.sort()) === JSON.stringify(eligiblePlayerIds.sort())) {
        lastPot.amount += potAmount;
      } else {
        this.pots.push({ amount: potAmount, eligiblePlayerIds });
      }

      contributors.forEach(p => p.bet -= minBet);
      while (contributors.length > 0 && contributors[0].bet === 0) {
        contributors.shift();
      }
    }

    this.players.forEach(p => {
      p.bet = 0;
      p.hasActed = false;
    });
    this.currentBet = 0;
    this.previousBet = 0;
  }

  nextPhase() {
    const activePlayers = this.players.filter(p => p.status === 'active');
    const allInPlayers = this.players.filter(p => p.status === 'all-in');
    
    console.log(`Phase transition: ${this.currentPhase} -> ?`);
    console.log(`Active players: ${activePlayers.length}, All-in players: ${allInPlayers.length}`);

    // Réinitialiser les actions pour la nouvelle phase, sauf pour ceux qui ont foldé
    this.players.forEach(p => {
      if (p.status !== 'folded') p.lastAction = null;
    });

    // If only one active player remains (others all-in or folded), we might go straight to showdown
    if (activePlayers.length <= 1 && allInPlayers.length > 0) {
        console.log("Only one active player (or zero) with all-ins. Running out community cards.");
        // Run out community cards
        while (this.communityCards.length < 5) {
            if (this.communityCards.length === 0) this.communityCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
            else this.communityCards.push(this.deck.pop());
        }
        this.currentPhase = 'river';
        this.gameState = 'showdown';
        this.determineWinners();
        return;
    }

    switch (this.currentPhase) {
      case 'pre-flop':
        this.currentPhase = 'flop';
        this.communityCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
        break;
      case 'flop':
        this.currentPhase = 'turn';
        this.communityCards.push(this.deck.pop());
        break;
      case 'turn':
        this.currentPhase = 'river';
        this.communityCards.push(this.deck.pop());
        break;
      case 'river':
        this.gameState = 'showdown';
        this.determineWinners();
        return;
    }

    // New round starts with player after dealer
    this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
    while (this.players[this.currentPlayerIndex].status !== 'active') {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
    
    this.startTurnTimer();
    this.notify();
  }

  determineWinners() {
    const nonFoldedPlayers = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');
    const playerHands = nonFoldedPlayers.map(p => ({
      playerId: p.id,
      hand: HandEvaluator.evaluate([...p.cards, ...this.communityCards])
    }));

    const consolidatedResults = {}; // playerId -> { amount, handName, name }

    // Distribute each pot
    for (const pot of this.pots) {
      if (pot.amount === 0) continue;

      const eligibleHands = playerHands.filter(ph => pot.eligiblePlayerIds.includes(ph.playerId));
      
      if (eligibleHands.length === 0) continue;

      if (eligibleHands.length === 1) {
        // Return unmatched pot to the only eligible player (no rake)
        const player = this.players.find(p => p.id === eligibleHands[0].playerId);
        player.chips += pot.amount;
        continue;
      }

      eligibleHands.sort((a, b) => HandEvaluator.compare(b.hand, a.hand));
      const winners = eligibleHands.filter(h => HandEvaluator.compare(h.hand, eligibleHands[0].hand) === 0);
      
      // Calcul du rake (5%)
      const rake = Math.floor(pot.amount * 0.05);
      const amountToDistribute = pot.amount - rake;
      const winAmount = Math.floor(amountToDistribute / winners.length);

      winners.forEach(w => {
        const player = this.players.find(p => p.id === w.playerId);
        player.chips += winAmount;
        
        if (!consolidatedResults[player.id]) {
          consolidatedResults[player.id] = {
            playerId: player.id,
            name: player.name,
            amount: 0,
            handName: HandEvaluator.getHandDescription(w.hand)
          };
        }
        consolidatedResults[player.id].amount += winAmount;
      });
    }

    this.winnerInfo = Object.values(consolidatedResults);
    this.finishHand();
  }

  finishHand(singleWinner = null) {
    if (this.turnTimer) clearTimeout(this.turnTimer);

    if (singleWinner) {
      const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);
      singleWinner.chips += totalPot;
      this.winnerInfo = [{
        playerId: singleWinner.id,
        name: singleWinner.name,
        amount: totalPot,
        handName: "TOUS LES AUTRES ONT FOLDÉ"
      }];
    }

    this.gameState = 'showdown';
    this.notify();

    if (this.onHandEnd) {
      this.onHandEnd(this.players.map(p => ({ name: p.name, chips: p.chips })));
    }

    setTimeout(() => {
      this.gameState = 'waiting';
      this.winnerInfo = null;
      this.pots = [];
      this.communityCards = [];
      if (this.players.filter(p => p.chips > 0).length >= 2) {
        this.startHand();
      }
      this.notify();
    }, 5000);
  }

  getStateForPlayer(playerId) {
    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);
    return {
      id: this.id,
      maxPlayers: this.maxPlayers,
      gameState: this.gameState,
      communityCards: this.communityCards,
      pot: totalPot,
      pots: this.pots,
      currentPhase: this.currentPhase,
      currentPlayerIndex: this.currentPlayerIndex,
      currentBet: this.currentBet,
      previousBet: this.previousBet,
      winnerInfo: this.winnerInfo,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        position: p.position,
        status: p.status,
        lastAction: p.lastAction,
        cards: (p.id === playerId || this.gameState === 'showdown') ? p.cards : [],
        handResult: (this.gameState === 'showdown' && p.status !== 'folded') ? 
          HandEvaluator.getHandDescription(HandEvaluator.evaluate([...p.cards, ...this.communityCards])) : null
      }))
    };
  }
}
