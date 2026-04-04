import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }

      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      setUser(data);
      setLoading(false);
    }
    fetchUser();
  }, []);

  return { user, loading, setUser };
}
