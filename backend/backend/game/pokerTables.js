const Poker = require('poker-ts');
const crypto = require('crypto');
const Soldes = require("../model/Soldes");
const pokerHandSolver = require('pokersolver').Hand;
const disconnectedPlayers = require('../data/SharedData');
const utilCompletion = require('../data/UtilsPokerTable');
const HistoriqueMain = require('../model/HistoriqueMain');
const playerTablesMap = require('./playerTables');
const playerCavesMap = require('./playerCaves');
const idlePlayersMap = require('./idlePlayers');

class PokerTable {
    constructor(tableInfo) {
        this.players = new Map();
        this.seatTaken = new Set();
        this.maxSeats = 9;
        this.seatTaken = new Set();
        this.table = new Poker.Table({
            ante: 0,
            smallBlind: tableInfo.smallBlind,
            bigBlind: tableInfo.bigBlind
        });    
        this.tableInfo = tableInfo;
        this.id = crypto.randomUUID();
        this.currentRoundActions = [];
        this.foldedPlayers = new Set();
        this.activePlayers = 0;
        this.lastPots = [];
        this.autoFoldTimeout = null;
        this.holeCards = [];
        this.holeCardsToShow = [];
        this.manualPots = [];
        this.roundIndex = 0;
        this.playerInHandInitial = new Set();
        this.lastActPlayer = null;
        this.quitImmediately = [];
        this.removedPlayers = new Map();
        this.isShowDownInProgress = false;
        
        this.caves = new Map();
        this.avatarsMaxNb = 19;
        this.avatars = [];

        this.disconnectTimers = new Map(); // Map to hold disconnect timers for each player (userId -> timeoutId)
    }

    handleDisconnect(userId, socketId) {
        try {
            // console.log('[DISCONNECT] handleDisconnect()', userId);
            // if timers already exist, do nothing
            if (this.disconnectTimers.has(Number(userId))) return;

            // console.log('[DISCONNECT] Starting timer for user:', userId);
            
            const player = this.players.get(socketId);
            // console.log('[DISCONNECT] Player found:', player.user.id, player.seatIndex);
            // Start a 30-minute timer
            const timeoutId = setTimeout(async () => {
                // add player to idle players
                const idlePlayers = idlePlayersMap.get(this.tableInfo.id) || [];
                if (!idlePlayers.find(id => id !== player.user.id)) {
                    idlePlayers.push(player.user.id);
                }
                // // console.log('[DISCONNECT] Idle players:', idlePlayers);
                idlePlayersMap.set(this.tableInfo.id, idlePlayers);
            }, 30 * 60 * 1000); // 30 minutes
    
            this.disconnectTimers.set(userId, timeoutId);
        } catch (err) {
            console.error('[DISCONNECT] Error handling disconnect for user:', userId, err);
        }
    }

    handleReconnect(userId) {
        // // console.log('[RECONNECT] handleReconnect()', userId);
        // If a timer exists, clear it
        const timeoutId = this.disconnectTimers.get(userId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.disconnectTimers.delete(userId);
            let idlePlayers = idlePlayersMap.get(this.tableInfo.id) || [];
            idlePlayers = idlePlayers.filter(id => id !== userId);
            idlePlayersMap.set(this.tableInfo.id, idlePlayers);
            // // console.log('[RECONNECT] Timer cleared for user:', userId);
        }
    }
    
    async endGame() {
        try {
            const table = this.table;
            const pokerTable = this;
            const tableSessionId = this.id;
            let completeCard = false;
            
            if (table.areBettingRoundsCompleted()) {
                const preShowdownStacks = table.seats().map(seat => seat?.stack ?? 0);
                const comms = table.communityCards().map(c => `${c.rank}${c.suit[0]}`);
    
                if(pokerTable.countActivePlayers() > 1 && comms.length < 5) {
                    completeCard = true;
                }
                    
                const communityCard = utilCompletion.completeToFiveCards(comms, pokerTable.holeCards, completeCard);
    
                const holdeCards = pokerTable.holeCardsToShow;
                const activeHands = holdeCards.map((hole, index) => {
                    if (hole == null|| hole.length === 0) return null;
                    if(pokerTable.foldedPlayers.has(index)) return null;
    
                    const fullCards = [...hole, ...communityCard];
                    const hand = pokerHandSolver.solve(fullCards);
                    hand.playerIndex = index;
                    return hand;
                }).filter(h => h !== null);
    
                const allCards = holdeCards.map((card, index) => {
                    if(card === null || card.length === 0) return [];
                    if(pokerTable.foldedPlayers.has(index)) return [];
                    return card;
                });
    
                const pkwinners = pokerHandSolver.winners(activeHands);
                const mainWinners = pkwinners.map(w => w.playerIndex);
                 
                const {combined, orphanPots} = pokerTable.restorePots();
                const { updatedStacks, detailedWinners } = await this.distributeWinnings(preShowdownStacks, combined, activeHands, orphanPots, mainWinners);
                table.showdown();
                pokerTable.isShowDownInProgress = true;
                await pokerTable.replacePlayer(updatedStacks);
    
                const winStates = table.seats().map((seat, index) => {
                    return {
                        seat: index,
                        handName: !(pokerTable.foldedPlayers.size + 1 === pokerTable.activePlayers) ? 'Lose': 'all fold',
                        isWinner: false
                    };
                });
                
                detailedWinners.forEach((winner) => {
                    const index = winner.playerIndex;
                    winStates[index].handName = !(pokerTable.foldedPlayers.size + 1 === pokerTable.activePlayers) ? winner.descr: 'win';
                    winStates[index].isWinner = true;
                });
    
                const playerNames = Array(this.maxSeats).fill(null);
                for (const player of this.players.values()) {
                    if (player.seatIndex !== undefined) {
                        playerNames[player.seatIndex] = player.user.name;
                        
                        const solde = await Soldes.findOne({ where: { userId: player.user.id } });
                        const amount = solde.montant;
                        const cave = this.caves.get(player.user.id);
                        const stack = updatedStacks[player.seatIndex];
                        const newSolde = Number(amount) - Number(cave) + Number(stack);
                        
                        // // console.log('User', player.user.id);
                        // // console.log('Solde', amount);
                        // // console.log('Cave', cave);
                        // // console.log('Stack', stack);
                        // // console.log('New Solde', newSolde);
                        
                        solde.montant = newSolde;
                        
                        await solde.save();
                        
                        this.caves.set(player.user.id, stack);
                    }
                }
                    
                const data = pokerTable.prepareHistoriqueMain(communityCard, pokerTable.holeCards, pokerTable.foldedPlayers, detailedWinners, playerNames);
                    
                try {
                    await HistoriqueMain.create({
                        table_name: data.table_name,
                        cartes_communaute: data.cartes_communaute,
                        main_joueurs: data.main_joueurs,
                        foldes: data.foldes,
                        gagnants: data.gagnants
                    });
                    // // console.log("✅ Historique sauvegardé !");
                } catch (error) {
                    console.error("❌ Erreur lors de l’enregistrement de l’historique :", error);
                }
    
                const result = {
                    allCards: !(pokerTable.foldedPlayers.size + 1 === pokerTable.activePlayers) ? allCards : [],
                    winStates: winStates,
                    communityCards: communityCard
                }
                    
                pokerTable.broadcastWin(result);
                pokerTable.broadcastState();
    
                const disconnectedPlayersSession = disconnectedPlayers.get(tableSessionId);
                if (disconnectedPlayersSession) {
                    for (const [disconnectedUserId, player] of disconnectedPlayersSession.entries()) {
                        try {
                            const stack = table.seats()[player.seatIndex]?.stack ?? 0;
                            const userId = player.user.id;
                            const solde = await Soldes.findOne({ where: { userId } });
                            if (stack > 0 && (!player.quiteDate || Date.now() >= player.quiteDate.getTime())) {
                                console.warn('[END GAME] solde updated anormally');
                              //  const newSoldeAmount = Number(solde.montant) + Number(stack);
                             //   await Soldes.update({ montant: Number(newSoldeAmount) }, { where: { userId } });
                                console.warn('[END GAME] anyone exit table anormally');
                               // await pokerTable.removePlayer(player.socketio.id);
                                
                            }
    
                        } catch (ignored) {
                            // // console.log("erreur lors de rajout de solde");
                        }
                    }
                    pokerTable.broadcastState();
                    if (disconnectedPlayersSession.size === 0) {
                        disconnectedPlayers.delete(tableSessionId);
                    }
                }
    
                pokerTable.foldedPlayers = new Set();
                
                for(const player of pokerTable.removedPlayers.values()) {
                    this.removePlayer(player.socketio.id);
                }

                for (const player of this.players.values()) {
                    if (idlePlayersMap.get(this.tableInfo.id)?.find(id => id === player.user.id)) {
                        // // console.log('[END GAME] Remove idle player :', player.user.id, player.seatIndex);
                        this.removePlayer(player.socketio.id);
                    }
                }
                
                setTimeout(() => {
                    for(const player of pokerTable.removedPlayers.values()) {
                        // // console.log('[END GAME] Player removed:', player.user.id, player.seatIndex);
                        player.send("quitsuccess", {});
                    }
                    for (const player of this.players.values()) {
                        if (idlePlayersMap.get(this.tableInfo.id)?.find(id => id === player.user.id)) {
                            // // console.log('[END GAME] emit quitsuccess for :', player.user.id, player.seatIndex);
                            player.send('quitsuccess', {});
                        }
                    }
                    pokerTable.broadcastState();
                }, 15000);
    
                setTimeout(async () => {
                    try {
                        function sleep(ms) {
                            return new Promise(resolve => setTimeout(resolve, ms));
                        }
                        this.shareCards();
                        await sleep(5000);
                        pokerTable.startGame();   
                    } catch (err) { }
                    pokerTable.broadcastState();
                    pokerTable.isShowDownInProgress = false;
                }, 15000);
            }else {
                pokerTable.broadcastState(true);
            }
        } catch (error) {
          console.error('Error', error);
        }
        
    }

    shareCards() {
        for (const player of this.players.values()) {
            player.send("shareCards", {message: "share cards"});
        }
    }

    countActivePlayers() {
        return this.playerInHandInitial.size - this.foldedPlayers.size;
    }

    async distributeWinnings(preShowdownStacks, pots, activeHands, orphanPots = 0, mainWinners = []) {
        const updatedStacks = [...preShowdownStacks];
        const detailedWinners = [];
        for (const pot of pots) {
            const eligibleIndexes = pot.eligiblePlayers;
            const activeHandsOfPot = activeHands.filter(hand => eligibleIndexes.includes(hand.playerIndex));
            const potWinners = pokerHandSolver.winners(activeHandsOfPot); 

            const winnerIndexes = potWinners.map(w => w.playerIndex);

            if (winnerIndexes.length === 0 || pot.size == 0) continue;

            if(pot.eligiblePlayers.length > 1) {
                for (const winner of potWinners) {  
                            
                    detailedWinners.push({
                        playerIndex: winner.playerIndex,
                        descr: winner.descr
                    });
                }
            }
            
            const rakeSize = pot.isRakeable ? 0.05 : 0 
            const rake = Math.floor(pot.size * rakeSize);
            const netPot = pot.size - rake;

            const amountPerReceiver = Math.floor(netPot / winnerIndexes.length);
            const remainder = netPot % winnerIndexes.length;

            for (const index of winnerIndexes) {
                updatedStacks[index] += amountPerReceiver;
            }

            if (remainder > 0) {
                updatedStacks[winnerIndexes[0]] += remainder;
            }

            if (orphanPots > 0 && mainWinners.length > 0) {
                const share = Math.floor(orphanPots / mainWinners.length);
                let remainder = orphanPots % mainWinners.length;

                for (const winnerIndex of mainWinners) {
                    updatedStacks[winnerIndex] += share;
                    if (remainder > 0) {
                        updatedStacks[winnerIndex] += 1;
                        remainder--;
                    }
                }
            }
        }

        return { updatedStacks, detailedWinners };
    }

    async playerAction(socket, playerSeats, action, bet, disconnectedPlayers) {
        try {
            const table = this.table;
            const pokerTable = this;    
            const tableSessionId = this.id;
            let completeCard = false;
            
            if(table.isHandInProgress()) {
                // // console.log('[PLAYER ACTION] Table - Hand in progress !');
                if(table.isBettingRoundInProgress()) {
                    if(table.playerToAct() !== playerSeats) {
                        // // console.log('[PLAYER ACTION] Table - Player to act is different to player seats !');
                        if(socket != null) {
                            socket.emit('playerActionError', { message: 'not your turn' });
                        }
                        // // console.log('×');
                        return;
                    }else {
                        // // console.log('[PLAYER ACTION] Table - Player to act is the same as player seats !');
                        if (action == 'fold') {
                            if(!pokerTable.foldedPlayers.has(playerSeats)) {
                                pokerTable.foldedPlayers.add(playerSeats);
                            }
                            pokerTable.holeCardsToShow[playerSeats] = null;
                        }    
                        table.actionTaken(action, bet);
    
                        pokerTable.cancelAutoFoldTimer();
                        
                        pokerTable.currentRoundActions = pokerTable.currentRoundActions.filter(
                            action => action.playerId !== playerSeats
                        );
                        pokerTable.currentRoundActions.push({
                            playerId: playerSeats,
                            action: action,
                            amount: table.seats()[playerSeats].betSize
                        });
                    }
                    let actionTaken = false;
                    let loopSafetyCounter = 0;
                    do {
                        actionTaken = false;
                        const disconnected = disconnectedPlayers.get(tableSessionId);
                        if (disconnected) {
                            for (const [uid, p] of (disconnected.entries() || [])) {
                                const seatDisconnected = p.seatIndex;
                                const currentPlayer = this.getPlayer(seatDisconnected);
                                try {
                                    if(table.playerToAct() === Number(seatDisonnected) && currentPlayer?.user?.id === uid) {
                                        if(!pokerTable.foldedPlayers.has(seatDisonnected)) {
                                            pokerTable.foldedPlayers.add(seatDisonnected);
                                        }
                                        pokerTable.holeCardsToShow[seatDisonnected] = null;
                                        table.actionTaken('fold');
                                        actionTaken = true;
        
                                        pokerTable.currentRoundActions = pokerTable.currentRoundActions.filter(
                                            action => action.playerId !== seatDisonnected
                                        );
                                        pokerTable.currentRoundActions.push({
                                            playerId: seatDisonnected,
                                            action: 'fold',
                                            amount: 0
                                        });
                                    }
                                } catch (ignored) {
                                    actionTaken = false;
                                    console.error('[PLAYER ACTION] Ignored', ignored);                     
                                }
                            }
                        }
                        loopSafetyCounter++;
                        if (loopSafetyCounter > 10) {
                          console.warn('Auto fold loop stopped by security !');
                          break;
                        }
                    } while (actionTaken);
                } 
                if(!table.isBettingRoundInProgress()) {
                    if (!pokerTable.manualPots[pokerTable.roundIndex]) {
                        pokerTable.manualPots[pokerTable.roundIndex] = [];
                    }
    
                    const seats = table.seats() || [];
                    for (let i = 0; i < seats.length; i++) {
                        if (seats[i]) {
                            const manualPot = pokerTable.manualPots[pokerTable.roundIndex];
                            const existingEntry = manualPot.find(entry => entry.seatIndex === i);

                            // // console.log('[PLAYER ACTION] MANUAL POT', manualPot);
                            // // console.log('[PLAYER ACTION] EXISTING ENTRY', existingEntry);
                            if (existingEntry) {
                                existingEntry.betSize = seats[i].betSize;
                                // // console.log('[PLAYER ACTION] existing entry bet size', existingEntry.betSize);
                            } else {
                                manualPot.push({ seatIndex: i, betSize: seats[i].betSize });
                                // // console.log('[PLAYER ACTION] New MANUAL POT', manualPot);
                            }
                        }
                    }
                    pokerTable.currentRoundActions = [];
                    pokerTable.roundIndex += 1;
    
                    if(!table.areBettingRoundsCompleted()) {
                        table.endBettingRound();
                    }
                }
                
                
                if (table.areBettingRoundsCompleted()) {
                    this.endGame();
                    
                }else {
                    pokerTable.broadcastState(true);
                }
            }
        } catch (error) {
            console.error('[PLAYER ACTION] Error', error);
        }
    }

    getFreesit() {
        const freesit = Number(this.maxSeats) - Number(this.seatTaken.size);
        return freesit;
    }

    cleanPots(pots, foldedPlayers) {
        const cleanedPots = [];
        
        let orphanPotSize = 0;
        

        for (const pot of pots) {
            const eligiblePlayersBeforeFilter = pot.eligiblePlayers.length;
            pot.eligiblePlayers = pot.eligiblePlayers.filter(p => !foldedPlayers.includes(p));

            if (pot.eligiblePlayers.length === 0) {
                orphanPotSize += pot.size;
            } else {
                pot.isRakeable = eligiblePlayersBeforeFilter > 1;
                cleanedPots.push(pot);
            }
        }

        if (cleanedPots.length === 2) {
            const size0 = cleanedPots[0].size;
            const size1 = cleanedPots[1].size;

            if (size0 === 2 * size1 || size1 === 2 * size0) {
                cleanedPots[0].isRakeable = true;
                cleanedPots[1].isRakeable = true;
            }
        }

        return {cleanedPots, orphanPotSize};
    }

    restorePots() {
        const allRoundPots = [];
        let orphanPots = 0;

        for (let roundIndex = 0; roundIndex < this.manualPots.length; roundIndex++) {
            const roundBets = this.manualPots[roundIndex];
            if (!roundBets || roundBets.length === 0) {
                allRoundPots.push([]);
                continue;
            }

            const totalBetsBySeat = new Map();
            for (const { seatIndex, betSize } of roundBets) {
                if (betSize > 0) {
                    totalBetsBySeat.set(seatIndex, (totalBetsBySeat.get(seatIndex) || 0) + betSize);
                }
            }

            let seatStacks = Array.from(totalBetsBySeat.entries())
            .map(([seatIndex, amount]) => ({ seatIndex, remaining: amount }));
            const pots = [];

            while (seatStacks.length > 0) {
                const minBet = Math.min(...seatStacks.map(s => s.remaining));

                const eligible = seatStacks.map(s => s.seatIndex);

                const potSize = minBet * eligible.length;
                pots.push({
                    size: potSize,
                    eligiblePlayers: [...eligible]
                });

                seatStacks = seatStacks
                .map(s => ({ seatIndex: s.seatIndex, remaining: s.remaining - minBet }))
                .filter(s => s.remaining > 0);
            }
            const {cleanedPots, orphanPotSize} = this.cleanPots(pots, Array.from(this.foldedPlayers.values()));
            orphanPots += orphanPotSize; 
            allRoundPots.push(cleanedPots);
        }
        const combined = allRoundPots.flat();
        return {combined, orphanPots};
    }

    mergeAndSortPotsByRound(flatedPots, orphanPots) {
        const merged = [...flatedPots];
        const sorted = merged.sort((a, b) => b.eligiblePlayers.length - a.eligiblePlayers.length);
    
        const groupedMap = new Map();

        for (const pot of sorted) {
            if  (pot.eligiblePlayers.length <= 1) continue;
            const key = pot.eligiblePlayers.slice().sort((a, b) => a - b).join(',');

            if (groupedMap.has(key)) {
                groupedMap.get(key).size += pot.size;
            } else {
                groupedMap.set(key, { ...pot, eligiblePlayers: [...pot.eligiblePlayers] });
            }
        }

        const result = Array.from(groupedMap.values());

        if (orphanPots > 0) {
            result.push({
                size: orphanPots,
                eligiblePlayers: []
            });
        }
        
        return result;
    }

    async replacePlayer(stacks) {
        for (const player of this.players.values()) {
            if (player.seatIndex != undefined) {
                try {
                    const seats = this.table.seats();
                    // // console.log('[REPLACE PLAYER] seat state :', seats[player.seatIndex]);
                    if (seats[player.seatIndex] !== null) {
                        // // console.log('[REPLACE PLAYER] stand up');
                        this.table.standUp(player.seatIndex);  
                    }
                    
                    const stack = stacks[player.seatIndex];
                    if(stack && stack > 0) {
                        const seats = this.table.seats();
                        // // console.log('[REPLACE PLAYER] seat state :', seats[player.seatIndex]);
                        if (seats[player.seatIndex] === null) {
                            // // console.log('[REPLACE PLAYER] sit down');
                            this.table.sitDown(player.seatIndex, stack);
                        }
                            
                    } else {
                        // // console.log("[REPLACE PLAYER] To remove :", player.seatIndex );
                            
                        this.removedPlayers.set(player.seatIndex, player);
                    }
                } catch (err) {
                    console.error('[REPLACE PLAYER] ERR seat', player.seatIndex, err);
                    // console.log('[REPLACE PLAYER] Remove player');
                    await this.removePlayer(player.socketio.id);
                }
            }
        }
    }

    prepareHistoriqueMain(
        communityCards,
        holeCards,
        foldedPlayers,
        mainWinners,
        playerNames
        ) {
        
        const table_name = this.tableInfo?.name ?? '-';
        const main_joueurs = [];

        for (let i = 0; i < playerNames.length; i++) {
            const pseudo = playerNames[i];
            const cartes = holeCards[i];
        
            if (pseudo && Array.isArray(cartes) && cartes.length > 0) {
                main_joueurs.push({ pseudo, cards: cartes });
            }
        }

        const foldes = [];
        if (foldedPlayers instanceof Set) {
            for (const idx of foldedPlayers) {
            if (playerNames[idx]) foldes.push(playerNames[idx]);
            }
        } else if (Array.isArray(foldedPlayers)) {
            for (const idx of foldedPlayers) {
            if (playerNames[idx]) foldes.push(playerNames[idx]);
            }
        }

        const gagnants = [];
        if (Array.isArray(mainWinners)) {
            for (const idx of mainWinners) {
                const playerName = playerNames[idx.playerIndex];
                if (playerName && !gagnants.includes(playerName)) {
                    gagnants.push(playerName);
                }
            }
        }

        if (gagnants.length === 0) {
            for (const pseudo of playerNames) {
                if (pseudo && !foldes.includes(pseudo)) {
                    gagnants.push(pseudo);
                    break; // On suppose qu’un seul gagnant
                }
            }
        }


        return {
            table_name,
            cartes_communaute: communityCards,
            main_joueurs,
            foldes,
            gagnants
        };
    }


    checkStartConditions() {
        if (!this.table.isHandInProgress() && !this.isShowDownInProgress && this.seatTaken.size >= 2) {
            this.startGame();
                   
        }
        try {
            this.broadcastState();
        } catch (error) {
            console.log(error);
            
        }
    }

    startGame() {
        this.foldedPlayers = new Set();
        this.table.startHand();
        this.activePlayers = this.table.numActivePlayers();
        this.lastPots = [];
        this.manualPots = [];
        this.roundIndex = 0;
        if(!this.manualPots[this.roundIndex]) {
            this.manualPots[this.roundIndex] = [];
        }

        const seats = this.table.seats() || [];
        for(let i = 0; i < seats.length; i++) {
            if(seats[i]) {
                this.manualPots[this.roundIndex].push({seatIndex: i, betSize: seats[i].betSize});
            }
        }
        
        for(const player of this.removedPlayers.values()) {
            this.removePlayer(player.socketio.id);
            player.send("quitsuccess", {});
        }
        this.removedPlayers.clear();

        this.playerInHandInitial = new Set();
        const playersInHand = this.table.handPlayers();
        for (let i = 0; i < playersInHand.length; i++) {
            if (playersInHand[i]) {
                this.playerInHandInitial.add(i);
            }
        }

        const hands = this.table.holeCards();

        if (hands?.length > 0) {
            
            const holesCardsPlayer = hands.map(hand => 
                Array.isArray(hand)
                    ? hand.map(c => `${c.rank}${c.suit?.[0] ?? '?'}`)
                    : []
            );
            this.holeCards = [...holesCardsPlayer];
            this.holeCardsToShow = [...holesCardsPlayer];

        }
        this.broadcastStart();
        this.broadcastState(true)
        
        // // console.log('🃏 Partie démarrée automatiquement !');
    }    

    hasSeatAvailable() {
        return this.seatTaken.size < this.maxSeats;
    }
    
    getAvailableSeatIndex() {
        for (let i = 0; i < this.maxSeats; i++) {
            if (!this.seatTaken.has(i)) return i;
        }
        return null;
    }
    
    addPlayer(player, seatPlayer) {
        try {
            let seatIndex = null;
            if (seatPlayer !== null && seatPlayer !== undefined) {
                if (seatPlayer >= 0 && seatPlayer < this.maxSeats && !this.seatTaken.has(seatPlayer)) {
                    seatIndex = seatPlayer;
                } else {
                    return false;
                }
            } else {
                seatIndex = this.getAvailableSeatIndex();
            }

            if (seatIndex === null) return false;
            
            function rand(min, max) {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }

            const avatar = `${rand(0, this.avatarsMaxNb - 1)}.png`;
            // // console.log('[ADD PLAYER] avatar :', avatar);
            const existingAvatar = this.avatars.find(avt => avt.userId === player.user.id); 
            if (existingAvatar) {
                existingAvatar.avatar = avatar;
            } else {
                this.avatars.push({
                    userId: player.user.id,
                    avatar: avatar,
                });
            }

            const seats = this.table.seats();
            if (seats[seatIndex] !== null) {
              this.table.standUp(seatIndex);
            }
            
            this.table.sitDown(seatIndex, player.chips);
            
            this.players.set(player.socketio.id, player);
            player.seatIndex = seatIndex;
            this.seatTaken.add(seatIndex);
            this.checkStartConditions();
            this.caves.set(player.user.id, player.chips);

            let playerCavesVal = playerCavesMap.get(player.user.id);
            let caveObj = playerCavesVal?.find(cave => cave.tableId === this.tableInfo.id);
            
            if (caveObj) {
                caveObj.cave = player.chips;
            } else {
                caveObj = {
                    tableId: this.tableInfo.id,
                    cave: player.chips,
                }
                // console.log('[ADD PLAYER] new cave object', caveObj);
                playerCavesVal = playerCavesVal ?? [];
                playerCavesVal.push(caveObj);
            }
            // console.log('[ADD PLAYER] new player caves value', playerCavesVal);

            playerCavesMap.set(player.user.id, playerCavesVal);

            return true;
        }catch(err) {
            console.error('[ADD PLAYER] ERR', err);
            return false;
        }
    }

    async removePlayer(socketId) {
        try {
            const player = this.players.get(socketId);
            if (!player) return false;
        
            const seatIndex = player.seatIndex;
            this.seatTaken.delete(seatIndex);
            this.players.delete(socketId);
            
            const seats = this.table.seats();
            // console.log('[REMOVE PLAYER] seat state :', seats[seatIndex]);
            
          //  if (seats[seatIndex] === null) return false;
            
            // console.log('[REMOVE PLAYER] remove player table id', this.tableInfo.id);
            let playerTables = playerTablesMap.get(player.user.id) ?? [];
            // console.log('[REMOVE PLAYER] player tables before', playerTables);
            playerTables = playerTables.filter(table => Number(table) !== Number(this.tableInfo.id));
            // console.log('[REMOVE PLAYER] player table after', playerTables);
            playerTablesMap.set(player.user.id, playerTables);
           
            this.table.standUp(seatIndex);

            // console.log('[REMOVE PLAYER] remove avatar of user', player.user.id);
            this.avatars = this.avatars.filter(avt => avt.userId !== player.user.id);

            playerCavesMap.delete(player.user.id);
            
            return true;
        }catch (err) {
            console.error('[REMOVE PLAYER] ERR', err);
        }
    }

    countPlayer() {
        const stacks = this.table.seats();
        let count = 0;
        stacks.forEach(stack => {
            if(!stack) {
                count ++;
            }    
        });

        return count;
    }

    getPlayer(seatindex) {
        for(const player of this.players.values()) {
            if(Number(player.seatIndex) === Number(seatindex)) {
                return player;
            }
        }
        return null
    }

    startAutoFoldTimer(expectedToAct) {
        try {
            if (this.autoFoldTimeout) {
                clearTimeout(this.autoFoldTimeout);
                this.autoFoldTimeout = null;
            }

            if (this.table.isHandInProgress()) {
                const toAct = this.table.playerToAct();
                if (expectedToAct !== toAct) {
                  return;
                }
                this.autoFoldTimeout = setTimeout(async () => {
                    try {
                        const stillToAct = this.table.playerToAct();
                        
                        if (toAct === stillToAct) {
                            const player = this.getPlayer(stillToAct);
                            const action = this.table.legalActions().actions.includes('check') ? 'check' : 'fold';
                            
                            await this.playerAction(player?.socketio ?? null, stillToAct, action, 0, disconnectedPlayers);
                        }
                    } catch (error) {
                      console.error('[AUTOFOLD TIMER] ERR', error);
                    }
                }, 12000);
            }
        }catch(err) {
          console.error('Error', err);
        }
    }

    cancelAutoFoldTimer() {
        try {
            if (this.autoFoldTimeout) {
                clearTimeout(this.autoFoldTimeout);
                this.autoFoldTimeout = null;
            }
        } catch (error) {
          console.error('Error', error);
        }
    }

    isPlayerInHand(seatIndex) {
        if(!this.table.isHandInProgress()) {
            return false;
        }
        const result = this.playerInHandInitial.has(seatIndex) && !this.foldedPlayers.has(seatIndex);
     //   // console.log(result);
        return result;
    }

    getActiveSeats() {
        const activeSeats = [];
        for (let i = 0; i < this.maxSeats; i++) {
            if (this.isPlayerInHand(i)) {
                activeSeats.push(i);
            }
        }
        // console.log('Active seats :', activeSeats);
        return activeSeats;
    }

    broadcastWin(data) {
        for (const player of this.players.values()) {
            player.send("win", data);
        }
    }

    async broadcastStart() {
        for (const player of this.players.values()) {
            player.send("start", {message: "started"});
        }
    }

    broadcastState(isStart = false) {
        const activeSeats = this.getActiveSeats();
        const handInProgress = this.table.isHandInProgress();
       // // console.log('Hand in progress :', handInProgress);
        const tableId = this.id;
        const button = handInProgress ? this.table.button() : null;
        const communityCards = handInProgress
            ? this.table.communityCards().map(c => `${c.rank}${c.suit[0]}`)
            : [];
        const {combined, orphanPots} = this.restorePots()
        let pots = this.roundIndex !== 0 ? this.mergeAndSortPotsByRound(combined, orphanPots) : [{size:0}];
        
        if (handInProgress && pots.length > 0) {
            this.lastPots = pots;
        }        

        let toAct = null;
        if (handInProgress) {
            if(!this.table.isBettingRoundInProgress() && !this.table.areBettingRoundsCompleted()) {
                try{
                    // console.log("End betting round");
                    this.table.endBettingRound();
                }catch(ignored) {}
            }
            if(this.table.isBettingRoundInProgress()) {
                // console.log('Betting round is in progress !');
                toAct = this.table.playerToAct();
                // console.log('To act :', toAct);
            } else if (this.table.areBettingRoundsCompleted()) {
              // console.log('Game Over !');
              return this.endGame();
            }
        }
        
        const step = handInProgress ? this.table.roundOfBetting() : null;
        
        const playerNames = Array(this.maxSeats).fill(null);
        const playerIds = Array(this.maxSeats).fill(null);
        for (const player of this.players.values()) {
            if (player.seatIndex !== undefined) {
                playerNames[player.seatIndex] = player.user.name;
                playerIds[player.seatIndex] = player.user.id;
            }
        }

        // console.log('[BROADCAST STATE] avatars :', this.avatars);

        for (const player of this.players.values()) {
            try {
                const seatIndex = player.seatIndex;
                
                const data = {
                    tableId,
                    seat: seatIndex,
                    deal_btn: button,
                    handInProgress,
                    step,
                    toAct,
                    communityCards,
                    seats: this.table.seats(),
                    activeSeats,
                    playerNames,
                    playerIds,
                    actions: this.currentRoundActions,
                    playerCards: this.holeCards[seatIndex],
                    legalActions: handInProgress && seatIndex === toAct
                        ? this.table.legalActions()
                        : [],
                    pots,
                    avatars: this.avatars,
                };
                
                player.send('tableState', data);
                
                if(isStart && toAct !== null && toAct !== undefined) {
                    try{
                        this.startAutoFoldTimer(toAct);
                    }catch(err) {
                      console.error('Error', err);
                    }
                }
            } catch (error) {
                console.error(`Erreur d'envoi à ${player.name || 'unknown'} :`, error);
            }
        }
    }
}

module.exports = PokerTable;