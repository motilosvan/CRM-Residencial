import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PublicSitePage } from '../features/public-site/PublicSitePage';
import { LoginPage } from '../features/auth/LoginPage';
import { Forbidden403Page } from '../features/auth/Forbidden403Page';
import { NotFound404Page } from '../features/auth/NotFound404Page';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { InboxPage } from '../features/emails/InboxPage';
import { ValidationQueuePage } from '../features/validation/ValidationQueuePage';
import { RequestsPage } from '../features/requests/RequestsPage';
import { RequestDetailPage } from '../features/requests/RequestDetailPage';
import { ResidentsPage } from '../features/residents/ResidentsPage';
import { UsersPage } from '../features/users/UsersPage';
import { CatalogsPage } from '../features/catalogs/CatalogsPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { AuditPage } from '../features/audit/AuditPage';
import { AiLabPage } from '../features/ai-lab/AiLabPage';
import { AdminProtectedLayout } from '../layouts/AdminLayout';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicSitePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app/dashboard" element={<AdminProtectedLayout><DashboardPage /></AdminProtectedLayout>} />
        <Route path="/app/bandeja" element={<AdminProtectedLayout><InboxPage /></AdminProtectedLayout>} />
        <Route path="/app/validacion" element={<AdminProtectedLayout adminOnly><ValidationQueuePage /></AdminProtectedLayout>} />
        <Route path="/app/solicitudes" element={<AdminProtectedLayout><RequestsPage /></AdminProtectedLayout>} />
        <Route path="/app/solicitudes/:id" element={<AdminProtectedLayout><RequestDetailPage /></AdminProtectedLayout>} />
        <Route path="/app/residentes" element={<AdminProtectedLayout adminOnly><ResidentsPage /></AdminProtectedLayout>} />
        <Route path="/app/usuarios" element={<AdminProtectedLayout adminOnly><UsersPage /></AdminProtectedLayout>} />
        <Route path="/app/catalogos" element={<AdminProtectedLayout adminOnly><CatalogsPage /></AdminProtectedLayout>} />
        <Route path="/app/reportes" element={<AdminProtectedLayout adminOnly><ReportsPage /></AdminProtectedLayout>} />
        <Route path="/app/auditoria" element={<AdminProtectedLayout adminOnly><AuditPage /></AdminProtectedLayout>} />
        <Route path="/app/laboratorio-ia" element={<AdminProtectedLayout><AiLabPage /></AdminProtectedLayout>} />
        <Route path="/app/403" element={<AdminProtectedLayout><Forbidden403Page /></AdminProtectedLayout>} />
        <Route path="*" element={<NotFound404Page />} />
      </Routes>
    </BrowserRouter>
  );
}
