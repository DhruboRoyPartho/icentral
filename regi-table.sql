-- 1. Create a strict ENUM type for roles so invalid roles can't be inserted
CREATE TYPE user_role AS ENUM ('student', 'alumni', 'faculty');

-- 2. Create the profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  university_id TEXT UNIQUE,
  full_name TEXT NOT NULL,
  session TEXT, 
  email TEXT UNIQUE NOT NULL,
  phone_number TEXT,
  role user_role DEFAULT 'student',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. Turn on Row Level Security (RLS) for safety
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create a policy so anyone can read the profiles (needed for a social feed)
CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING ( true );

-- 5. Create a policy so users can only update their own profile
CREATE POLICY "Users can update own profile."
  ON public.profiles FOR UPDATE
  USING ( auth.uid() = id );