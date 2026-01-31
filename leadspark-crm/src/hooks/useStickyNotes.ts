import { useState, useEffect } from 'react';
import { stickyNotesApi } from '../lib/api';

export function useStickyNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = async () => {
    try {
      const data = await stickyNotesApi.getNotes();
      setNotes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotes(); }, []);

  return { notes, loading, refresh: fetchNotes };
}