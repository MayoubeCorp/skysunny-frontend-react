import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import TossPayment from './components/TossPayment';
import CheckCoupon from './pages/CheckCoupon';
import CheckPayment from './pages/CheckPayment';
import CompletePayment from './pages/CompletePayment';
import QrCode from './pages/QrCode';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/check-payment" />} />
        <Route path="/check-payment" element={<CheckPayment />} />
        <Route path="/complete-payment" element={<CompletePayment />} />
        <Route path="/check-coupon" element={<CheckCoupon />} />
        <Route path="/qr-code" element={<QrCode />} />
        <Route path="/toss-payment" element={<TossPayment />} />
      </Routes>
    </Router>
  );
}

export default App;
