<div align="center">
  
# 🚀 Ncs-LeadFlow CRM
  
  ![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
  ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
  ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

  **An Enterprise-Grade Lead Management Engine built for High-Performance Sales Teams.**
  
  *Bridging the gap between prospect inquiry and successful conversion with real-time intelligence.*

</div>

---

## 📖 Table of Contents
- [Overview](#overview)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## 🧐 Overview
**Ncs-LeadFlow** is a modern Full-Stack CRM developed for **Nucleosys Tech**. It solves the common problem of "lead leakage" by providing sales teams with real-time tracking, intelligent follow-up reminders, and a unified communication history. 

Unlike traditional CRMs, LeadFlow focuses on **speed and simplicity**, utilizing optimistic UI updates to ensure the sales workflow is never interrupted by loading screens.

---

## 🌟 Key Features

### 📋 Lead Intelligence
- **Dynamic Lead Hub:** Searchable, filterable, and sortable database of all business prospects.
- **Inline Editing:** Update status, priority, and assignees directly from the table view.
- **Bulk Operations:** Admin tools for mass lead reassignment and workload balancing.

### ⏳ Follow-Up & Call Tracking
- **Zero-Leakage System:** Visual alerts for **Overdue** tasks and **Due Today** priorities.
- **Interaction Logging:** A dedicated Call History module to record notes, key discussion points, and next steps.
- **Persistence:** Form autosave logic ensures you never lose data during lead creation.

### 📊 Real-Time Analytics
- **Conversion Tracking:** Monitor Won/Lost deal ratios and pipeline health via the Dashboard.
- **Trend Analysis:** 30-day activity charts and assignee performance metrics.
- **Data Portability:** Robust CSV Import/Export functionality for data migration.

### 🔐 Enterprise Security
- **RBAC (Role-Based Access Control):** Granular permissions for Admins vs. Employees.
- **RLS (Row Level Security):** Database-level security ensuring users only see relevant data.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 18 (Vite), TypeScript |
| **Styling** | Tailwind CSS, Shadcn UI, Lucide Icons |
| **State Management** | TanStack Query v5 (React Query) |
| **Backend / DB** | Supabase (Postgres), Row Level Security |
| **Auth** | Supabase GoTrue |
| **Validation** | Zod (Schema-based) |

---

## 📂 Architecture

```
src/
├── components/
│   ├── layout/       # App Sidebar, Header, and Global Search
│   ├── leads/        # Advanced Filters, Dialogs, Bulk Actions
│   └── ui/           # Radix-based design system components
├── hooks/            # Logic for Auth, Exports, Overdue status, and DB updates
├── integrations/     # Supabase client configuration and generated types
├── lib/              # Utility functions (Tailwind merge, etc.)
├── pages/            # View components (Dashboard, Leads, Settings)
└── types/            # Application-wide TypeScript interfaces
```

---

### 🚀 Installation

## 1. Clone & Install
```
git clone https://github.com/yashbnucleosys-21/Ncs-LeadFlow.git
cd Ncs-LeadFlow
npm install
```

## 2.Configure Environment
# Create a .env file in the root directory:

```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 3. Start Development

```
npm run dev
```

---

## 🗺️ Roadmap
- [ ] **WhatsApp Integration:** Direct one-click messaging from lead cards.
- [ ] **Email Automation:** Trigger-based follow-up emails for new leads.
- [ ] **Mobile App:** Responsive PWA for sales teams on the move.
- [ ] **AI Insights:** Lead scoring based on interaction history.

## 📄 License
Distributed under the MIT License.

**Developed by Yash Bhilare**  
*Powering Sales for Nucleosys Tech*

<div align="right">
  <a href="#top">⬆️ Back to Top</a>
</div>
