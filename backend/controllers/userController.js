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
    const { email, password, name } = req.body;

    // Vérification si l'email existe déjà
    const emailExists = await User.findOne({ where: { email } });
    if (emailExists) {
        return res.status(400).json({ 
            success: false,
            message: 'Cette adresse email est déjà utilisée' 
        });
    }

    // Vérification si le pseudo existe déjà
    const nameExists = await User.findOne({ where: { name } });
    if (nameExists) {
        return res.status(400).json({ 
            success: false,
            message: 'Ce pseudo est déjà utilisé' 
        });
    }

    try {
        const user = await User.create({ email, password, name });

        res.status(201).json({
            success: true,
            id: user.id,
            email: user.email,
            name: user.name,
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

exports.findByPseudo = asyncHandler(async (req, res)=> {
    const {name} = req.body;

    const user = await User.findOne({where: {name}});

    if(user) {
        res.json({name: user.name});     
    } else {
        res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
})

exports.updateUser = asyncHandler(async (req, res) => {
    const { name, avatar_url } = req.body;
    const { userId } = req.params;

    // Vérification que l'utilisateur connecté modifie bien son propre profil
    if (parseInt(req.user.id) !== parseInt(userId)) {
        return res.status(403).json({ success: false, message: 'Non autorisé à modifier ce profil' });
    }

    const user = await User.findByPk(userId);

    if (user) {
        if (name) {
            const nameExists = await User.findOne({ where: { name } });
            if (nameExists && nameExists.id !== user.id) {
                return res.status(400).json({ success: false, message: 'Ce pseudo est déjà utilisé' });
            }
            user.name = name;
        }
        if (avatar_url !== undefined) {
            user.avatar_url = avatar_url;
        }

        await user.save();
        res.json({
            success: true,
            message: 'Profil mis à jour',
            user: {
                id: user.id,
                name: user.name,
                avatar_url: user.avatar_url
            }
        });
    } else {
        res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }
});