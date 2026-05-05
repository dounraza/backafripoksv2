import { Table } from './logic/Table.js';
import HistoriqueMain from './models/HistoriqueMain.js';
import RevenuRake from './models/RevenuRake.js';
import { connectDB } from './config/database.js';

async function testRakeCollection() {
    console.log("Démarrage du test de collecte du Rake...");
    
    await connectDB();

    const table = new Table('test-table', { maxPlayers: 2 });
    
    // Simuler un callback onHandEnd similaire à celui d'index.js
    table.setHandEndCallback(async (playersData, rake) => {
      try {
        const historique = await HistoriqueMain.create({
          table_name: table.id,
          cartes_communaute: table.communityCards.map(c => c.value + c.suit),
          main_joueurs: table.players.filter(p => p.status !== 'out').map(p => ({
            pseudo: p.name,
            cards: p.cards.map(c => c.value + c.suit)
          })),
          rake: rake
        });
        
        if (rake > 0) {
          const now = new Date();
          await RevenuRake.create({
            montant: rake,
            historiqueMainId: historique.id,
            date: now,
            month: now.getMonth() + 1,
            year: now.getFullYear()
          });
        }
        console.log(`Test réussi: Historique et RevenuRake enregistrés avec rake = ${rake}`);
      } catch (err) {
        console.error('Erreur lors du test:', err);
      }
    });

    // Simuler une fin de main avec un pot de 1000
    table.pots = [{ amount: 1000, eligiblePlayerIds: ['p1', 'p2'] }];
    table.totalRake = 50; // Simulation du calcul
    
    console.log("Déclenchement du callback onHandEnd...");
    await table.onHandEnd([], table.totalRake);
    
    process.exit(0);
}

testRakeCollection().catch(err => {
    console.error(err);
    process.exit(1);
});
