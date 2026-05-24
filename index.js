require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const sequelize = require("./backend/config/Db");
const authRoutes = require("./backend/routes/authRoutes");
const authAdminRoutes = require("./backend/routes/UserAdminRoutes");
const soldeRoutes = require("./backend/routes/soldeRoutes");
const soldeAdminRoutes = require("./backend/routes/soldeAdminRoutes");
const depotMobileRoutes = require("./backend/routes/DepotModileMoneyRoutes");
const depotCryptoRoutes = require("./backend/routes/DepotCryptoMoneyRoutes");
const retraitCrypto = require("./backend/routes/RetraitCryptoRoutes");
const retraitMobile = require("./backend/routes/RetraitMobileRoutes");
const typeCrypto = require("./backend/routes/TypeRoutes");
const tableRoutes = require("./backend/routes/tableRoute"); 
const EnvoieRoutes = require("./backend/routes/EnvoieRoutes"); 
const protect = require('./backend/middleware/authMiddleware');
const { adminProtect, authAny } = require('./backend/middleware/adminAuthMiddleware');
const { serverSocket } = require("./backend/serverSocket");
const historiqueRoutes = require("./backend/routes/HistoriqueMainRoutes");
const userConnectedRoutes = require("./backend/routes/userConnected");
const userRoutes = require("./backend/routes/userRoutes");


require('./backend/model/Envoie');
require('./backend/model/UserAdmin');
require('./backend/model/DepotCryptoMoney');
require('./backend/model/DepotMobileMoney');
require('./backend/model/RetraitCryptoMoney');
require('./backend/model/RetraitMobileMoney');
require('./backend/model/Soldes');
require('./backend/model/Table');
require('./backend/model/TypeCryptoMoney');
require('./backend/model/User');
sequelize.authenticate()
  .then(() => {
    console.log("Connexion à MySQL réussie.");
    // return sequelize.sync({ force: true });
  })
  .catch(err => console.error("Échec de connexion à MySQL :", err));

const corsOptions = {
  origin: "*"
};

const app = express();

app.use(cors(corsOptions));
app.use('/uploads/avatars', express.static(path.join(__dirname, 'backend', 'public', 'avatars')));


app.use(express.json({ extended: false }));

app.use("/api/auth", authRoutes);
app.use("/api/auth/admin", authAdminRoutes);
app.use("/api", soldeRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api", soldeAdminRoutes);
app.use("/api/depot", depotMobileRoutes);
app.use("/api/depot", depotCryptoRoutes);
app.use("/api", typeCrypto);
app.use("/api/retrait", retraitMobile);
app.use("/api/retrait", retraitCrypto);
app.use("/api", EnvoieRoutes);
app.use("/api/historique", historiqueRoutes);
app.use("/api/userConnected", userConnectedRoutes);
app.use("/api/users", userRoutes);

const httpServer = serverSocket(app);   

const port = process.env.PORT || 5000;
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use.`);
  } else {
    console.error('Server error:', err);
  }
});
httpServer.listen(port, () => console.log(`Server is running on the port ${port}`));
