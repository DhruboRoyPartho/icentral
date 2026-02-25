require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY 
);

const JWT_SECRET = process.env.JWT_SECRET || 'HelloWorldKey';

async function signup(req, res) {
    const {university_id, full_name, session, email, phone_number, role, password} = req.body;

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const {data, error} = await supabase
            .from('users')
            .insert([{
                university_id,
                full_name,
                session,
                email,
                phone_number,
                role,
                password_hash: hashedPassword
            }])
            .select('id, email, role, full_name')
            .single();

        if (error) throw error;

        res.status(201).json({success: true, message: 'Registration successful', user: data});
    } catch (err) {
        console.error(err);
        res.status(400).json({success: false, message: 'Registration failed, Email or ID might be already exists'});
    }
};

async function login(req, res) {
    const {email, password} = req.body;

    try {
        const {data: user, error} = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if(error || !user) {
            return res.status(401).json({success: false, message: 'Invalid credentials'});
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if(!isMatch) {
            return res.status(401).json({success: false, message: 'Invalid credentials'});
        }

        const token = jwt.sign(
            {
                id: user.id,
                role: user.role,
                email: user.email
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            success: true,
            token,
            user: {id: user.id, email: user.email, role: user.role, full_name: user.full_name}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({success: false, message: 'Server error during login'});
    }
};

module.exports = {
    signup,
    login
};