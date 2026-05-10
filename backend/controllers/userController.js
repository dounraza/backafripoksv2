const User = require("../model/User");
const asyncHandler = require("express-async-handler");
const generateToken = require('../config/generateToken');

exports.authUser = asyncHandler(async (req, res)=> {
    const {email, password} = req.body;
    
    const user = await User.findOne({ where: { email }});

    if(user && (await user.validPassword(password))) {
        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            accessToken: generateToken(user.id, '1d')
        });     
    } else {
        res.status(401).json('Invalid Email or password');
    }
})

exports.register = asyncHandler(async (req, res) => {
    const { 
        email, 
        password, 
        name, 
        avatar_url, 
        mobile_money_provider, 
        mobile_money_number, 
        mobile_money_account_name 
    } = req.body;

    // Vérification si l'email existe déjà
    const emailExists = await User.findOne({ where: { email } });
    if (emailExists) {
        return res.status(400).json({ 
            success: false,
            message: 'Cette adresse email est déjà utilisée' 
        });
    }

    // Vérification si le pseudo (name) existe déjà
    const nameExists = await User.findOne({ where: { name } });
    if (nameExists) {
        return res.status(400).json({ 
            success: false,
            message: 'Ce pseudo est déjà utilisé' 
        });
    }

    try {
        const user = await User.create({ 
            email, 
            password, 
            name, 
            avatar_url, 
            mobile_money_provider, 
            mobile_money_number, 
            mobile_money_account_name 
        });

        res.status(201).json({
            success: true,
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            mobile_money_provider: user.mobile_money_provider,
            mobile_money_number: user.mobile_money_number,
            mobile_money_account_name: user.mobile_money_account_name,
            accessToken: generateToken(user.id, '1d')
        });     
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Une erreur est survenue lors de l\'inscription' 
        });
    }
});

exports.findByName = asyncHandler(async (req, res)=> {
    const {name} = req.body;

    const user = await User.findOne({where: {name}});

    if(user) {
        res.json({name: user.name});     
    } else {
        res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
})

exports.updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await User.findByPk(id);
    
    if (user) {
        let updateData = { ...req.body };
        
        if (req.file) {
            updateData.avatar_url = `/avatars/${req.file.filename}`;
        }
        
        await user.update(updateData);
        res.json({
            success: true,
            user
        });
    } else {
        res.status(404).json({ message: "Utilisateur non trouvé" });
    }
});