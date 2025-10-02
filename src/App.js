import React from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import CheckCoupon from './pages/CheckCoupon';
import CheckPaymentToss from './pages/CheckPaymentToss';
import CompletePayment from './pages/CompletePayment';
import ParentLogin from './pages/ParentLogin';
import QrCode from './pages/QrCode';
import { initWebViewBridge } from './utils/webviewBridge';

function App() {
  // 웹뷰 브리지 초기화
  React.useEffect(() => {
    initWebViewBridge();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/cash" />} />
        <Route path="/cash" element={<CheckPaymentToss />} />
        <Route path="/complete-payment" element={<CompletePayment />} />
        <Route path="/check-coupon" element={<CheckCoupon />} />
        <Route path="/qr-code" element={<QrCode />} />
        <Route path="/parent-login" element={<ParentLogin />} />
      </Routes>
    </Router>
  );
}

export default App;
