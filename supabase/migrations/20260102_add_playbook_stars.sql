-- AgentPlaybooks Database Schema
-- Migration: Add playbook stars (favorites) functionality

-- ============================================
-- PLAYBOOK_STARS - Users can star/favorite playbooks
-- ============================================
CREATE TABLE playbook_stars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(playbook_id, user_id)
);

CREATE INDEX idx_playbook_stars_playbook ON playbook_stars(playbook_id);
CREATE INDEX idx_playbook_stars_user ON playbook_stars(user_id);

-- Add star_count to playbooks for denormalized quick access
ALTER TABLE playbooks ADD COLUMN star_count INT DEFAULT 0;
CREATE INDEX idx_playbooks_star_count ON playbooks(star_count DESC) WHERE is_public = true;

-- Add tags to playbooks for filtering
ALTER TABLE playbooks ADD COLUMN tags TEXT[] DEFAULT '{}';
CREATE INDEX idx_playbooks_tags ON playbooks USING GIN(tags);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE playbook_stars ENABLE ROW LEVEL SECURITY;

-- Anyone can see stars count (via playbooks), but only authenticated can star
CREATE POLICY "Users can manage own stars" ON playbook_stars
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read stars" ON playbook_stars
    FOR SELECT USING (true);

-- ============================================
-- FUNCTIONS FOR STAR COUNT
-- ============================================

-- Function to increment star count when star is added
CREATE OR REPLACE FUNCTION increment_star_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE playbooks SET star_count = star_count + 1 WHERE id = NEW.playbook_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement star count when star is removed
CREATE OR REPLACE FUNCTION decrement_star_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE playbooks SET star_count = GREATEST(star_count - 1, 0) WHERE id = OLD.playbook_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers for star count
CREATE TRIGGER star_added
    AFTER INSERT ON playbook_stars
    FOR EACH ROW
    EXECUTE FUNCTION increment_star_count();

CREATE TRIGGER star_removed
    AFTER DELETE ON playbook_stars
    FOR EACH ROW
    EXECUTE FUNCTION decrement_star_count();

