-- 1. Create the ENUM for roles
CREATE TYPE user_role AS ENUM ('student', 'alumni', 'faculty');

-- 2. Create the standalone users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  session TEXT, 
  email TEXT UNIQUE NOT NULL,
  phone_number TEXT,
  role user_role DEFAULT 'student',
  avatar_url TEXT,
  password_hash TEXT NOT NULL, -- We store the hashed password here
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);