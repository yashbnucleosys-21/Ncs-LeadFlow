import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Building2, Mail, Phone, Command as CommandIcon, Loader2, X } from 'lucide-react';
import { Lead } from '@/types/database';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/status-badge';

export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounced search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      const searchTerm = query.toLowerCase();
      
      try {
        const { data, error } = await supabase
          .from('Lead')
          .select('id, leadName, companyName, email, phone, status, priority')
          .or(`leadName.ilike.%${searchTerm}%,companyName.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
          .limit(10);

        if (!error && data) {
          setResults(data as Lead[]);
        }
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard shortcuts (Cmd+K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback((leadId: number) => {
    navigate(`/leads/${leadId}`);
    setOpen(false);
    setQuery('');
    setResults([]);
  }, [navigate]);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <Popover open={open && query.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full max-w-md group">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            ref={inputRef}
            placeholder="Search leads by name, company, email..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.length > 0) {
                setOpen(true);
              } else {
                setOpen(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results.length > 0) {
                handleSelect(results[0].id);
              }
            }}
            className="pl-10 pr-24 h-10 bg-muted/50 border-muted-foreground/20 focus:bg-background focus:border-primary/50 transition-all duration-200 rounded-lg"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {query.length > 0 && !isLoading && (
              <button 
                onClick={clearSearch}
                className="p-1 hover:bg-muted rounded-full text-muted-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
            <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded-md border bg-muted/80 px-2 font-mono text-[11px] font-medium text-muted-foreground shadow-sm">
              <CommandIcon className="h-3 w-3" />K
            </kbd>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[450px] p-0 shadow-2xl border-border/50 rounded-xl overflow-hidden" 
        align="start"
        sideOffset={8}
        // FIX: This line prevents the Popover from stealing focus from the Input
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command className="rounded-none border-none">
          <CommandList className="max-h-[450px] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium text-muted-foreground animate-pulse">Searching lead database...</p>
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty className="py-12 text-center">
                <div className="bg-muted/30 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-6 h-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-foreground">No leads found</p>
                <p className="text-xs text-muted-foreground mt-1 px-8">
                  We couldn't find any results matching "{query}"
                </p>
              </CommandEmpty>
            ) : (
              <CommandGroup heading={`${results.length} results found`}>
                {results.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={`${lead.leadName} ${lead.companyName} ${lead.email}`}
                    onSelect={() => handleSelect(lead.id)}
                    className="flex items-center gap-3 p-3 cursor-pointer aria-selected:bg-primary/5 transition-colors border-b last:border-0 border-border/40"
                  >
                    <div className="bg-primary/10 w-9 h-9 rounded-lg flex items-center justify-center text-primary flex-shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-foreground truncate">{lead.leadName}</span>
                        <StatusBadge status={lead.status} className="scale-75 origin-right" />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground overflow-hidden">
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <Building2 className="w-3 h-3" />
                          {lead.companyName}
                        </span>
                        {lead.email && (
                          <span className="flex items-center gap-1 truncate border-l pl-3">
                            <Mail className="w-3 h-3 flex-shrink-0" />
                            {lead.email}
                          </span>
                        )}
                        {lead.phone && (
                          <span className="flex items-center gap-1 border-l pl-3 hidden sm:flex">
                            <Phone className="w-3 h-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}