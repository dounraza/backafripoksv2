import { Player } from './Player.js';
import { HandEvaluator } from './HandEvaluator.js';

export class Table {
  constructor(id, config = {}) {
    this.id = id;
    this.gameType = config.gameType || 'holdem';
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
    this.sbIndex = -1;
    this.bbIndex = -1;
    this.currentPlayerIndex = -1;
    this.currentPhase = 'pre-flop';
    this.onUpdate = null;
    this.onHandEnd = null; // Callback pour persister en DB
    this.winnerInfo = null;
    this.turnTimer = null;
    this.currentBet = this.bigBlind; 
    this.previousBet = 0;
    this.totalRake = 0;
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
    
    console.log(`Démarrage timer pour joueur index ${this.currentPlayerIndex}`);

    this.turnTimer = setTimeout(() => {
      const activePlayer = this.players[this.currentPlayerIndex];
      
      if (activePlayer && this.gameState === 'playing') {
        // Règle standard: Si le joueur peut checker, on fait check. Sinon, on fold.
        if (activePlayer.bet === this.currentBet) {
          console.log(`Auto-check pour ${activePlayer.name}`);
          this.handleAction(activePlayer.id, 'check');
        } else {
          console.log(`Auto-fold pour ${activePlayer.name}`);
          this.handleAction(activePlayer.id, 'fold');
        }
        this.notify();
      }
    }, 15000); // 15 secondes
  }

  addPlayer(id, name, chips, avatarUrl = null) {
    if (this.players.length >= this.maxPlayers) return { error: 'Table pleine' };
    const player = new Player(id, name, chips, avatarUrl);
    
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
    const playerName = player.name;
    let chipsToReturn = player.chips;

    // ANTI-EXPLOIT: Raha mbola "playing" ny table ary ilay mpilalao dia "active" na "all-in"
    // dia ny "chips" (jetons en main) ihany no averina. Ny "bet" (jetons efa eo ambony latabatra)
    // dia mijanona ho an'ny pot raha sendra miala izy.
    if (this.gameState === 'playing' && (player.status === 'active' || player.status === 'all-in')) {
      console.log(`Anti-exploit: ${playerName} miala nefa mbola milalao. Ny chips ${player.chips} ihany no averina.`);
      // Raha ny anjarany no milalao dia fold-entsika izy
      if (this.currentPlayerIndex === playerIndex) {
        this.handleAction(id, 'fold');
      } else {
        player.status = 'folded'; // Force fold raha tsy ny anjarany
      }
    }

    this.players.splice(playerIndex, 1);
    
    // Ajuster currentPlayerIndex si nécessaire suite à la suppression
    if (this.gameState === 'playing' && this.currentPlayerIndex >= playerIndex) {
      this.currentPlayerIndex = Math.max(0, this.currentPlayerIndex - 1);
    }

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
    this.totalRake = 0;
    
    this.createDeck();
    this.shuffleDeck();
    
    this.players.forEach(p => {
      p.resetForNewHand();
      p.lastAction = null;
      if (p.chips > 0) {
        const numCards = this.gameType === 'omaha' ? 4 : 2;
        p.cards = [];
        for (let i = 0; i < numCards; i++) {
          p.cards.push(this.deck.pop());
        }
        p.status = 'active';
      } else {
        p.status = 'out';
      }
    });

    const activePlayers = this.players.filter(p => p.status === 'active');
    if (activePlayers.length < 2) {
        this.gameState = 'waiting';
        return { error: 'Pas assez de joueurs with tokens' };
    }

    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    
    // Find active players for blinds
    const activeIndices = [];
    for (let i = 0; i < this.players.length; i++) {
        const idx = (this.dealerIndex + i) % this.players.length;
        if (this.players[idx].status === 'active') {
            activeIndices.push(idx);
        }
    }

    if (activeIndices.length === 2) {
        // Heads-up logic: Dealer is SB, next is BB
        this.sbIndex = activeIndices[0];
        this.bbIndex = activeIndices[1];
    } else {
        // Standard logic: next after dealer is SB, next after that is BB
        this.sbIndex = activeIndices[1 % activeIndices.length];
        this.bbIndex = activeIndices[2 % activeIndices.length];
    }

    this.postBlind(this.players[this.sbIndex], this.smallBlind);
    this.postBlind(this.players[this.bbIndex], this.bigBlind);
    
    // Pre-flop: Player after BB starts (or SB if heads-up)
    if (activeIndices.length === 2) {
        this.currentPlayerIndex = this.sbIndex;
    } else {
        let startIdx = (this.bbIndex + 1) % this.players.length;
        while (this.players[startIdx].status !== 'active') {
            startIdx = (startIdx + 1) % this.players.length;
        }
        this.currentPlayerIndex = startIdx;
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

    // TAPAKA NY TIMER raha vao nanao action izy
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }

    switch (action) {
      case 'fold':
        player.status = 'folded';
        player.lastAction = 'fold';
        
        // 1v1 logic: Raha 1v1 ary nanao fold, dia ny mpilalao hafa rehetra (non-folded/out) dia lasa winner avy hatrany
        const nonFolded = this.players.filter(p => p.status !== 'folded' && p.status !== 'out');
        if (nonFolded.length === 1) {
          this.collectBets();
          this.finishHand(nonFolded[0]);
          return { success: true };
        }
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
        // Si c'est la première mise, le minRaise est le bigBlind (ou le double de la mise actuelle)
        const minRaise = this.currentBet === 0 ? this.bigBlind : this.currentBet * 2;
        
        const isAllIn = (raiseTotal === player.chips + player.bet);
        
        if (raiseTotal < minRaise && !isAllIn) {
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
        
        this.players.forEach(p => {
          if (p.status === 'active' && p.id !== player.id) p.hasActed = false;
        });
        player.hasActed = true;
        this.collectBets(); 
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

    // Auto-check logic for Big Blind pre-flop if no raises
    const currentPlayer = this.players[this.currentPlayerIndex];
    if (this.currentPhase === 'pre-flop' && 
        currentPlayer.position === this.bbIndex && 
        currentPlayer.bet === this.currentBet && 
        !currentPlayer.hasActed) {
        console.log(`Auto-check pour BB: ${currentPlayer.name}`);
        this.handleAction(currentPlayer.id, 'check');
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
    const playerHands = nonFoldedPlayers.map(p => {
      let hand;
      if (this.gameType === 'omaha') {
        hand = HandEvaluator.evaluateOmaha(p.cards, this.communityCards);
      } else {
        hand = HandEvaluator.evaluate([...p.cards, ...this.communityCards]);
      }
      return {
        playerId: p.id,
        hand: hand
      };
    });

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
      const potRake = Math.floor(pot.amount * 0.05);
      this.totalRake += potRake;
      const amountToDistribute = pot.amount - potRake;
      const winAmount = Math.floor(amountToDistribute / winners.length);

      winners.forEach(w => {
        const player = this.players.find(p => p.id === w.playerId);
        if (player) {
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
        } else {
          console.warn(`Gagnant non trouvé à la table: ${w.playerId}. Jetons perdus ou à gérer.`);
        }
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
      this.onHandEnd(this.players.map(p => ({ name: p.name, chips: p.chips })), this.totalRake);
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
    }, 12000);
  }

  getStateForPlayer(playerId) {
    const totalPot = this.pots.reduce((sum, p) => sum + p.amount, 0);
    const requester = this.players.find(p => p.id === playerId);
    const requesterFolded = requester && (requester.status === 'folded' || requester.status === 'out');

    return {
      id: this.id,
      gameType: this.gameType,
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
      players: this.players.map((p, index) => {
        const isOwnCard = p.id === playerId;
        const someoneWonByFold = this.winnerInfo && this.winnerInfo.length > 0 && this.winnerInfo[0].handName === "TOUS LES AUTRES ONT FOLDÉ";

        return {
          id: p.id,
          name: p.name,
          chips: p.chips,
          avatarUrl: p.avatarUrl,
          bet: p.bet,
          position: p.position,
          status: p.status,
          lastAction: p.lastAction,
          role: index === this.dealerIndex ? 'dealer' : 
                index === this.sbIndex ? 'small' : 
                index === this.bbIndex ? 'big' : null,
          cards: (p.status === 'folded' || p.status === 'out') ? [] : (isOwnCard || this.gameState === 'showdown') ? p.cards : [],
          handResult: (this.gameState === 'showdown' && p.status !== 'folded' && !someoneWonByFold) ? 
            HandEvaluator.getHandDescription(this.gameType === 'omaha' ? HandEvaluator.evaluateOmaha(p.cards, this.communityCards) : HandEvaluator.evaluate([...p.cards, ...this.communityCards])) : null
        };
      })
    };
  }
}
