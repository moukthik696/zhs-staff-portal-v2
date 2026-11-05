-- Run this script in your Supabase SQL Editor to create the necessary tables for the app.

-- 1. Teachers Table
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id TEXT UNIQUE NOT NULL, -- e.g., 't1', 't2'
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    classes TEXT[] DEFAULT '{}',
    responsibilities TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Insert initial teachers
INSERT INTO public.teachers (teacher_id, name, subject, classes, responsibilities) VALUES
('t1', 'Sriveni', 'English', ARRAY['6th', '7th', '8th'], ARRAY[]::TEXT[]),
('t2', 'Vinod Sir', 'Mathematics', ARRAY['9th', '10th', '11th'], ARRAY[]::TEXT[]),
('t3', 'Bhavya', 'Social Studies', ARRAY['7th', '8th'], ARRAY[]::TEXT[]),
('t4', 'Madhuri', 'Social Studies', ARRAY['9th', '10th'], ARRAY[]::TEXT[]),
('t5', 'Kavitha', 'Mathematics', ARRAY['9th', '10th'], ARRAY[]::TEXT[]),
('t6', 'Madhavi', 'Telugu', ARRAY['7th', '8th', '9th', '10th'], ARRAY['Teacher Attendance Coordinator', 'Substitution Coordinator'])
ON CONFLICT (teacher_id) DO NOTHING;

-- 2. Leave Requests Table
CREATE TABLE IF NOT EXISTS public.leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id TEXT NOT NULL REFERENCES public.teachers(teacher_id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_principal', -- pending_principal, pending_coordinator, completed, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Substitutions Table
CREATE TABLE IF NOT EXISTS public.substitutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_request_id UUID NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    original_teacher_id TEXT NOT NULL REFERENCES public.teachers(teacher_id) ON DELETE CASCADE,
    period TEXT NOT NULL,
    class TEXT NOT NULL,
    substitute_teacher_id TEXT NOT NULL REFERENCES public.teachers(teacher_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Set up Row Level Security (RLS)
-- For this application, since we are using a proxy server (Express), 
-- we can allow anon access for now, or just disable RLS if you prefer,
-- but allowing anon access is generally needed for the client/server setup using the anon key.

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read access on teachers" ON public.teachers FOR SELECT USING (true);
CREATE POLICY "Allow anon insert access on teachers" ON public.teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update access on teachers" ON public.teachers FOR UPDATE USING (true);

CREATE POLICY "Allow anon read access on leave_requests" ON public.leave_requests FOR SELECT USING (true);
CREATE POLICY "Allow anon insert access on leave_requests" ON public.leave_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update access on leave_requests" ON public.leave_requests FOR UPDATE USING (true);

CREATE POLICY "Allow anon read access on substitutions" ON public.substitutions FOR SELECT USING (true);
CREATE POLICY "Allow anon insert access on substitutions" ON public.substitutions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update access on substitutions" ON public.substitutions FOR UPDATE USING (true);
