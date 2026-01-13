import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, PriorityBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Lead, LeadStatus, LeadPriority, User } from '@/types/database';
import { useAuth } from '@/hooks/useAuth';
import { useOptimisticUpdate } from '@/hooks/useOptimisticUpdate';
import { useOverdueLeads, getOverdueStatus } from '@/hooks/useOverdueLeads';
import { useAutosave, loadDraft, clearDraft, hasDraft } from '@/hooks/useAutosave';
import { toast } from 'sonner';
import { Plus, Building2, Mail, Phone, AlertTriangle, Clock, PhoneCall, Users, Calendar, Filter, Trash2 } from 'lucide-react';
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay, addDays, isWeekend } from 'date-fns';
import { LeadFilters } from '@/components/leads/LeadFilters';
import { LeadImportDialog } from '@/components/leads/LeadImportDialog';
import { InlineEditSelect } from '@/components/leads/InlineEditSelect';
import { QuickCallLogDialog } from '@/components/leads/QuickCallLogDialog';
import { BulkReassignDialog } from '@/components/leads/BulkReassignDialog';
import { useLeadExport } from '@/hooks/useLeadExport';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

const statusOptions: LeadStatus[] = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const priorityOptions: LeadPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

interface LeadFormData {
  leadName: string;
  companyName: string;
  email: string;
  contactPerson: string;
  phone: string;
  assignee: string;
  priority: LeadPriority;
  status: LeadStatus;
  leadSource: string;
  service: string;
  location: string;
  notes: string;
  nextFollowUpDate: string;
}

const defaultFormData: LeadFormData = {
  leadName: '',
  companyName: '',
  email: '',
  contactPerson: '',
  phone: '',
  assignee: '',
  priority: 'Medium',
  status: 'New',
  leadSource: '',
  service: '',
  location: '',
  notes: '',
  nextFollowUpDate: '',
};

// --- UPGRADE SECTION: Helper for Date Suggestion ---
const getNextBusinessDay = () => {
  let date = addDays(new Date(), 1);
  while (isWeekend(date)) {
    date = addDays(date, 1);
  }
  return format(date, 'yyyy-MM-dd');
};

export default function Leads() {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const { exportToCSV } = useLeadExport();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  
  // --- UPGRADE SECTION: Fix for recurring Restore popup ---
  const [hasCheckedDraft, setHasCheckedDraft] = useState(false);
  
  // Bulk selection state
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [isBulkReassignOpen, setIsBulkReassignOpen] = useState(false);
  
  // Quick call log state
  const [quickCallLead, setQuickCallLead] = useState<Lead | null>(null);
  const [isQuickCallOpen, setIsQuickCallOpen] = useState(false);

  // --- UPGRADE SECTION: Delete State ---
  const [leadToDelete, setLeadToDelete] = useState<number | null>(null);

  // --- UPGRADE SECTION: Duplicate Prevention State ---
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);

  // Optimistic update hook
  const { updateLead, loadingId } = useOptimisticUpdate();

  // Overdue metrics
  const { overdueCount, dueTodayCount } = useOverdueLeads(leads);

  // Create form state with autosave
  const [formData, setFormData] = useState<LeadFormData>(() => {
    const draft = loadDraft<LeadFormData>('lead-create');
    return draft || defaultFormData;
  });

  // --- UPGRADE SECTION: Form-Level Validation Logic (Updated to allow "NA") ---
  const validation = useMemo(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // logic: Valid if Empty OR literal "NA" OR matches email regex
    const isEmailValid = !formData.email || formData.email === 'NA' || emailRegex.test(formData.email);
    const isPhoneValid = !formData.phone || formData.phone.length === 10;
    const isDateValid = !formData.nextFollowUpDate || !isBefore(parseISO(formData.nextFollowUpDate), startOfDay(new Date()));
    const isRequiredFilled = formData.leadName.trim() !== '' && formData.companyName.trim() !== '';

    return {
      isEmailValid,
      isPhoneValid,
      isDateValid,
      isRequiredFilled,
      isValid: isEmailValid && isPhoneValid && isDateValid && isRequiredFilled
    };
  }, [formData]);

  // Autosave form data
  useAutosave({
    key: 'lead-create',
    data: formData,
    enabled: isCreateOpen && (formData.leadName !== '' || formData.companyName !== ''),
  });

  // --- UPGRADE SECTION: Check for draft on mount (Fixed logic to prevent recurring popup) ---
  useEffect(() => {
    const draft = loadDraft<LeadFormData>('lead-create');
    const hasActualContent = draft && (draft.leadName.trim() !== '' || draft.companyName.trim() !== '');
    
    if (hasActualContent && !hasCheckedDraft && !isCreateOpen) {
      const timer = setTimeout(() => {
        toast.info('You have an unsaved lead draft', {
          id: 'restore-draft-toast',
          action: {
            label: 'Restore',
            onClick: () => {
              setFormData(draft);
              setIsCreateOpen(true);
            },
          },
          cancel: {
            label: 'Discard',
            onClick: () => clearDraft('lead-create'),
          },
          duration: 5000,
        });
      }, 1000);
      setHasCheckedDraft(true);
      return () => clearTimeout(timer);
    }
  }, [hasCheckedDraft, isCreateOpen]);

  useEffect(() => {
    fetchLeads();
    fetchUsers();
  }, []);

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('Lead')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) {
      toast.error('Failed to fetch leads');
      console.error(error);
    } else {
      setLeads(data as Lead[]);
    }
    setIsLoading(false);
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('User')
      .select('*')
      .eq('status', 'active');

    if (error) {
      console.error('Failed to fetch users:', error);
    } else {
      setUsers(data as User[]);
    }
  };

  // --- UPGRADE SECTION: Duplicate Check Logic (Updated to ignore "NA" email) ---
  const checkForDuplicate = () => {
    return leads.find(lead => 
      (formData.email && formData.email !== 'NA' && lead.email?.toLowerCase() === formData.email.toLowerCase()) ||
      (formData.phone && lead.phone === formData.phone) ||
      (lead.companyName.toLowerCase() === formData.companyName.toLowerCase() && 
       lead.contactPerson?.toLowerCase() === formData.contactPerson?.toLowerCase())
    );
  };

  const handleCreateLead = async (e?: React.FormEvent, ignoreDuplicate = false) => {
    if (e) e.preventDefault();

    if (!formData.leadName.trim() || !formData.companyName.trim()) {
      toast.error('Lead name and company name are required');
      return;
    }

    // --- UPGRADE SECTION: Duplicate Prevention Check ---
    if (!ignoreDuplicate) {
      const duplicate = checkForDuplicate();
      if (duplicate) {
        setIsDuplicateDialogOpen(true);
        return;
      }
    }

    const leadData = {
      leadName: formData.leadName.trim(),
      companyName: formData.companyName.trim(),
      email: formData.email.trim() || null,
      contactPerson: formData.contactPerson.trim() || null,
      phone: formData.phone.trim() || null,
      assignee: formData.assignee || user?.email || null,
      priority: formData.priority,
      status: formData.status,
      leadSource: formData.leadSource.trim() || null,
      service: formData.service.trim() || null,
      location: formData.location.trim() || null,
      notes: formData.notes.trim() || null,
      nextFollowUpDate: formData.nextFollowUpDate || null,
    };

    const { error } = await supabase.from('Lead').insert(leadData);

    if (error) {
      toast.error('Failed to create lead');
      console.error(error);
    } else {
      toast.success('Lead created successfully');
      // --- UPGRADE SECTION: Sequence of cleanup to prevent autosave from re-triggering ---
      setIsCreateOpen(false); 
      setIsDuplicateDialogOpen(false); 
      setFormData(defaultFormData); 
      clearDraft('lead-create'); 
      fetchLeads();
    }
  };

  // --- UPGRADE SECTION: Delete Handler ---
  const handleDeleteLead = async () => {
    if (!leadToDelete) return;

    const { error } = await supabase
      .from('Lead')
      .delete()
      .eq('id', leadToDelete);

    if (error) {
      toast.error('Failed to delete lead');
      console.error(error);
    } else {
      toast.success('Lead deleted successfully');
      setLeads(prev => prev.filter(l => l.id !== leadToDelete));
      setLeadToDelete(null);
    }
  };

  // Inline update handlers
  const handleInlineStatusChange = useCallback(async (leadId: number, newStatus: LeadStatus) => {
    await updateLead(leadId, { status: newStatus }, leads, setLeads);
  }, [leads, updateLead]);

  const handleInlinePriorityChange = useCallback(async (leadId: number, newPriority: LeadPriority) => {
    await updateLead(leadId, { priority: newPriority }, leads, setLeads);
  }, [leads, updateLead]);

  const handleInlineAssigneeChange = useCallback(async (leadId: number, newAssignee: string) => {
    await updateLead(leadId, { assignee: newAssignee || null }, leads, setLeads);
  }, [leads, updateLead]);

  // --- UPGRADE SECTION: Next Follow-up Update for Existing Leads (TS FIX APPLIED) ---
  const handleInlineDateChange = async (leadId: number, newDate: string) => {
    if (newDate && isBefore(parseISO(newDate), startOfDay(new Date()))) {
      toast.error("Follow-up date cannot be in the past");
      return;
    }

    // Use manual optimistic update to bypass restricted updateLead hook types
    const originalLeads = [...leads];
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, nextFollowUpDate: newDate || null } : l));

    const { error } = await supabase
      .from('Lead')
      .update({ nextFollowUpDate: newDate || null })
      .eq('id', leadId);

    if (error) {
      setLeads(originalLeads); // Rollback on error
      toast.error('Failed to update follow-up date');
      console.error(error);
    } else {
      toast.success('Follow-up date updated');
    }
  };

  // Bulk selection handlers
  const toggleLeadSelection = (leadId: number) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const getSelectedLeadObjects = () => {
    return leads.filter(l => selectedLeads.has(l.id));
  };

  // Filter leads with date range support
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      searchQuery === '' ||
      lead.leadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.phone && lead.phone.includes(searchQuery));

    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || lead.priority === priorityFilter;
    const matchesAssignee =
      assigneeFilter === 'all' ||
      (assigneeFilter === 'unassigned' && !lead.assignee) ||
      lead.assignee === assigneeFilter;

    // Date range filter
    let matchesDateRange = true;
    if (lead.createdAt) {
      const leadDate = parseISO(lead.createdAt);
      if (dateFrom && isBefore(leadDate, startOfDay(dateFrom))) {
        matchesDateRange = false;
      }
      if (dateTo && isAfter(leadDate, endOfDay(dateTo))) {
        matchesDateRange = false;
      }
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesAssignee && matchesDateRange;
  });

  const handleExport = () => {
    if (filteredLeads.length === 0) {
      toast.error('No leads to export');
      return;
    }
    exportToCSV(filteredLeads, 'leads');
    toast.success(`Exported ${filteredLeads.length} lead(s)`);
  };

  // Get row class based on overdue status
  const getRowClassName = (lead: Lead) => {
    const status = getOverdueStatus(lead);
    if (status === 'overdue') return 'bg-destructive/[0.03] hover:bg-destructive/[0.06]';
    if (status === 'due-today') return 'bg-warning/[0.03] hover:bg-warning/[0.06]';
    return 'hover:bg-muted/50';
  };

  // Check if user can edit a lead
  const canEditLead = (lead: Lead) => {
    if (isAdmin) return true;
    return lead.assignee === user?.email;
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-8 animate-in fade-in duration-500">
        <PageHeader
          title={isAdmin ? 'All Leads' : 'My Leads'}
          description={isAdmin ? 'Manage all leads in the system' : 'Leads assigned to you'}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Overdue indicators */}
              <div className="flex gap-2 mr-2">
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="flex items-center gap-1.5 px-3 py-1">
                    <AlertTriangle className="w-3 h-3" />
                    {overdueCount} Overdue
                  </Badge>
                )}
                {dueTodayCount > 0 && (
                  <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1 border-warning text-warning">
                    <Clock className="w-3 h-3" />
                    {dueTodayCount} Due Today
                  </Badge>
                )}
              </div>

              {/* Bulk actions */}
              {isAdmin && selectedLeads.size > 0 && (
                <Button variant="outline" onClick={() => setIsBulkReassignOpen(true)} className="gap-2">
                  <Users className="w-4 h-4" />
                  Reassign ({selectedLeads.size})
                </Button>
              )}

              <Dialog open={isCreateOpen} onOpenChange={(open) => {
                setIsCreateOpen(open);
                if (!open) {
                  setFormData(defaultFormData);
                  clearDraft('lead-create');
                }
              }}>
                <DialogTrigger asChild>
                  <Button className="shadow-md gap-2">
                    <Plus className="w-4 h-4" />
                    Add Lead
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Lead</DialogTitle>
                    <DialogDescription>
                      Add a new lead to the system
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateLead} className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="leadName">Lead Name *</Label>
                        <Input
                          id="leadName"
                          value={formData.leadName}
                          onChange={(e) =>
                            setFormData({ ...formData, leadName: e.target.value })
                          }
                          placeholder="Enter lead name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Company Name *</Label>
                        <Input
                          id="companyName"
                          value={formData.companyName}
                          onChange={(e) =>
                            setFormData({ ...formData, companyName: e.target.value })
                          }
                          placeholder="Enter company name"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contactPerson">Contact Person</Label>
                        <Input
                          id="contactPerson"
                          value={formData.contactPerson}
                          onChange={(e) =>
                            setFormData({ ...formData, contactPerson: e.target.value })
                          }
                          placeholder="Contact name"
                        />
                      </div>
                      <div className="space-y-2">
                        {/* --- UPGRADE SECTION: Email Section with NA Option and Validation --- */}
                        <div className="flex justify-between items-end">
                          <Label htmlFor="email" className={!validation.isEmailValid ? "text-destructive" : ""}>Email</Label>
                          <Button 
                            type="button" 
                            variant="link" 
                            className="h-auto p-0 text-[10px] font-bold uppercase tracking-tight text-primary"
                            onClick={() => setFormData({ ...formData, email: 'NA' })}
                          >
                            Mark as NA
                          </Button>
                        </div>
                        <Input
                          id="email"
                          type="text"
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          placeholder="email@company.com or NA"
                          className={!validation.isEmailValid ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                        {!validation.isEmailValid && (
                          <p className="text-[0.8rem] font-medium text-destructive">Enter valid email or NA</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        {/* UPGRADE SECTION: Phone Number UX Enhancements */}
                        <Label htmlFor="phone" className={!validation.isPhoneValid && formData.phone ? "text-destructive" : ""}>Phone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) =>
                            setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })
                          }
                          placeholder="10-digit number"
                          className={!validation.isPhoneValid && formData.phone ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                        <p className={cn("text-[0.8rem] text-muted-foreground", !validation.isPhoneValid && formData.phone && "text-destructive font-medium")}>
                          {!validation.isPhoneValid && formData.phone
                            ? "Phone number must be exactly 10 digits"
                            : "Enter a valid 10-digit mobile number"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="leadSource">Lead Source</Label>
                        <Input
                          id="leadSource"
                          value={formData.leadSource}
                          onChange={(e) =>
                            setFormData({ ...formData, leadSource: e.target.value })
                          }
                          placeholder="e.g., Website, Referral"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value: LeadStatus) =>
                            setFormData({ ...formData, status: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select
                          value={formData.priority}
                          onValueChange={(value: LeadPriority) =>
                            setFormData({ ...formData, priority: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {priorityOptions.map((priority) => (
                              <SelectItem key={priority} value={priority}>
                                {priority}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="assignee">Assignee</Label>
                        <Select
                          value={formData.assignee || (isAdmin ? '' : user?.email || '')}
                          onValueChange={(value) =>
                            setFormData({ ...formData, assignee: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select assignee" />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.email}>
                                {u.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="service">Service</Label>
                        <Input
                          id="service"
                          value={formData.service}
                          onChange={(e) =>
                            setFormData({ ...formData, service: e.target.value })
                          }
                          placeholder="Service interested in"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          value={formData.location}
                          onChange={(e) =>
                            setFormData({ ...formData, location: e.target.value })
                          }
                          placeholder="City, Country"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {/* UPGRADE SECTION: Follow-up Date UX Improvements */}
                      <div className="flex justify-between items-end">
                        <Label htmlFor="nextFollowUpDate" className={!validation.isDateValid ? "text-destructive" : ""}>Next Follow-up Date</Label>
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => setFormData({ ...formData, nextFollowUpDate: getNextBusinessDay() })}
                        >
                          Suggest business day
                        </Button>
                      </div>
                      <Input
                        id="nextFollowUpDate"
                        type="date"
                        min={format(new Date(), 'yyyy-MM-dd')}
                        value={formData.nextFollowUpDate}
                        onChange={(e) =>
                          setFormData({ ...formData, nextFollowUpDate: e.target.value })
                        }
                        className={!validation.isDateValid ? "border-destructive focus-visible:ring-destructive" : ""}
                      />
                      {!validation.isDateValid && (
                        <p className="text-[0.8rem] font-medium text-destructive">Follow-up date cannot be in the past</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        placeholder="Additional notes..."
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setIsCreateOpen(false)}
                      >
                        Cancel
                      </Button>
                      {/* UPGRADE SECTION: Reactive Create Button State */}
                      <Button type="submit" disabled={!validation.isValid}>
                        Create Lead
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          }
        />

        {/* --- UPGRADE SECTION: Delete Confirmation Dialog --- */}
        <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the lead and all its history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteLead} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Lead
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* --- UPGRADE SECTION: Duplicate Prevention Dialog --- */}
        <Dialog open={isDuplicateDialogOpen} onOpenChange={setIsDuplicateDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-2 text-warning mb-2">
                <AlertTriangle className="w-5 h-5" />
                <DialogTitle>Possible Duplicate Lead</DialogTitle>
              </div>
              <DialogDescription>
                A lead with this data already exists. Proceed anyway?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsDuplicateDialogOpen(false)}>Review</Button>
              <Button variant="destructive" onClick={() => handleCreateLead(undefined, true)}>Create Duplicate</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enhanced Filters Section */}
        <div className="bg-card/50 backdrop-blur-sm border rounded-xl p-1 shadow-sm">
          <LeadFilters
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter}
            assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter}
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            users={users} isAdmin={isAdmin}
            onExport={handleExport} onImport={() => setIsImportOpen(true)}
            resultCount={filteredLeads.length}
          />
        </div>

        {/* Leads Table Card */}
        <Card className="border-none shadow-xl overflow-hidden rounded-xl bg-card">
          <Table>
            <TableHeader className="bg-muted/50 border-b">
              <TableRow>
                {isAdmin && (
                  <TableHead className="w-12 pl-4">
                    <Checkbox
                      checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                      onCheckedChange={toggleAllSelection}
                    />
                  </TableHead>
                )}
                <TableHead className="font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Lead Details</TableHead>
                <TableHead className="font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Contact Info</TableHead>
                <TableHead className="font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Status</TableHead>
                <TableHead className="font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Priority</TableHead>
                <TableHead className="font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Assignee</TableHead>
                <TableHead className="font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Next Follow-up</TableHead>
                <TableHead className="w-24 font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 8 : 7} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Filter className="w-8 h-8 opacity-20" />
                      <p>{isLoading ? 'Loading your leads...' : 'No leads matching criteria'}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => {
                  const overdueStatus = getOverdueStatus(lead);
                  const canEdit = canEditLead(lead);

                  return (
                    <TableRow
                      key={lead.id}
                      className={cn(
                        'cursor-pointer border-b last:border-0 transition-colors',
                        getRowClassName(lead)
                      )}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      {isAdmin && (
                        <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedLeads.has(lead.id)}
                            onCheckedChange={() => toggleLeadSelection(lead.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <p className="font-bold text-sm text-foreground">{lead.leadName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-medium">
                            <Building2 className="w-3 h-3" />
                            {lead.companyName}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                          {lead.email && (
                            <p className="flex items-center gap-1.5">
                              <Mail className="w-3 h-3" /> {lead.email}
                            </p>
                          )}
                          {lead.phone && (
                            <p className="flex items-center gap-1.5">
                              <Phone className="w-3 h-3" /> {lead.phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <InlineEditSelect
                          value={lead.status}
                          options={statusOptions}
                          onChange={(value) => handleInlineStatusChange(lead.id, value)}
                          disabled={!canEdit}
                          isLoading={loadingId === lead.id}
                          renderValue={(status) => <StatusBadge status={status} />}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <InlineEditSelect
                          value={lead.priority}
                          options={priorityOptions}
                          onChange={(value) => handleInlinePriorityChange(lead.id, value)}
                          disabled={!canEdit}
                          isLoading={loadingId === lead.id}
                          renderValue={(priority) => <PriorityBadge priority={priority} />}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isAdmin ? (
                          <InlineEditSelect
                            value={lead.assignee || ''}
                            options={['', ...users.map(u => u.email)]}
                            onChange={(value) => handleInlineAssigneeChange(lead.id, value)}
                            isLoading={loadingId === lead.id}
                            renderValue={(email) => (
                              <span className="text-xs font-medium bg-muted px-2 py-1 rounded">
                                {email ? email.split('@')[0] : <span className="italic text-muted-foreground">Unassigned</span>}
                              </span>
                            )}
                          />
                        ) : (
                          <span className="text-xs font-medium">
                            {lead.assignee ? lead.assignee.split('@')[0] : (
                              <span className="text-muted-foreground italic">Unassigned</span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      {/* --- UPGRADE SECTION: Inline Follow-up Update for Existing Leads --- */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="date"
                          min={format(new Date(), 'yyyy-MM-dd')}
                          defaultValue={lead.nextFollowUpDate || ''}
                          disabled={!canEdit}
                          onChange={(e) => handleInlineDateChange(lead.id, e.target.value)}
                          className="h-8 text-xs p-1 bg-transparent border-transparent hover:border-input focus:bg-background transition-all"
                        />
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={() => {
                              setQuickCallLead(lead);
                              setIsQuickCallOpen(true);
                            }}
                          >
                            <PhoneCall className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors"
                            disabled={!canEdit}
                            onClick={() => setLeadToDelete(lead.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Dialogs remain identical in logic */}
        <LeadImportDialog
          open={isImportOpen}
          onOpenChange={setIsImportOpen}
          onSuccess={fetchLeads}
        />

        <QuickCallLogDialog
          lead={quickCallLead}
          open={isQuickCallOpen}
          onOpenChange={setIsQuickCallOpen}
          onSuccess={fetchLeads}
        />

        <BulkReassignDialog
          leads={getSelectedLeadObjects()}
          users={users}
          open={isBulkReassignOpen}
          onOpenChange={setIsBulkReassignOpen}
          onSuccess={() => {
            setSelectedLeads(new Set());
            fetchLeads();
          }}
        />
      </div>
    </AppLayout>
  );
}