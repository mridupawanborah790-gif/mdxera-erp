-- Add Organization Type to profiles table
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' 
                   AND column_name = 'organization_type') THEN
        ALTER TABLE public.profiles ADD COLUMN organization_type text;
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.organization_type IS 'Type of organization: Retail or Distributor. Affects POS calculation logic.';
