import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import SiteLayout from './site/SiteLayout.jsx';
import Home from './site/Home.jsx';
import { PointOfSale, Programmes as SiteProgrammes, DataInsights, About, NotFound } from './site/Pages.jsx';
import { News, NewsPost, Careers, Join, Contact } from './site/Content.jsx';
import AppLayout, { NeedPharmacy } from './app/AppLayout.jsx';
import Login from './app/Login.jsx';
import Dashboard from './app/Dashboard.jsx';
import POS from './app/POS.jsx';
import Sales, { SaleDetail } from './app/Sales.jsx';
import Inventory, { ReceiveStock } from './app/Inventory.jsx';
import Patients, { PatientDetail } from './app/Patients.jsx';
import { Reminders, Programmes, Claims, Reports, Team, Settings } from './app/Ops.jsx';
import { Network, Pharmacies, Applications, Catalogue, Website } from './app/admin/HQ.jsx';

function Roles({ roles, children }) {
  const { can } = useAuth();
  return can(...roles) ? children : <Navigate to="/app" replace />;
}

const facility = (el) => <NeedPharmacy>{el}</NeedPharmacy>;
const hq = (el) => <Roles roles={['admin']}>{el}</Roles>;

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="point-of-sale" element={<PointOfSale />} />
        <Route path="programmes" element={<SiteProgrammes />} />
        <Route path="data" element={<DataInsights />} />
        <Route path="about" element={<About />} />
        <Route path="news" element={<News />} />
        <Route path="news/:slug" element={<NewsPost />} />
        <Route path="careers" element={<Careers />} />
        <Route path="join" element={<Join />} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="app/login" element={<Login />} />
      <Route path="app" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="pos" element={facility(<POS />)} />
        <Route path="sales" element={facility(<Sales />)} />
        <Route path="sales/:id" element={<SaleDetail />} />
        <Route path="patients" element={facility(<Patients />)} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="reminders" element={facility(<Reminders />)} />
        <Route path="inventory" element={facility(<Inventory />)} />
        <Route path="receive" element={facility(<Roles roles={['admin', 'owner', 'pharmacist']}><ReceiveStock /></Roles>)} />
        <Route path="programmes" element={<Programmes />} />
        <Route path="claims" element={<Roles roles={['admin', 'owner']}><Claims /></Roles>} />
        <Route path="reports" element={<Roles roles={['admin', 'owner']}><Reports /></Roles>} />
        <Route path="team" element={facility(<Roles roles={['admin', 'owner']}><Team /></Roles>)} />
        <Route path="settings" element={<Settings />} />
        <Route path="hq/network" element={hq(<Network />)} />
        <Route path="hq/pharmacies" element={hq(<Pharmacies />)} />
        <Route path="hq/applications" element={hq(<Applications />)} />
        <Route path="hq/catalogue" element={hq(<Catalogue />)} />
        <Route path="hq/website" element={hq(<Website />)} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  );
}
