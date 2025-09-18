# React Native WebView 설정 가이드

## 토스 결제 위젯 사용을 위한 WebView 설정

### 1. iOS 설정 (Info.plist)

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>js.tosspayments.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSExceptionMinimumTLSVersion</key>
            <string>TLSv1.0</string>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
        <key>pay.toss.im</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSExceptionMinimumTLSVersion</key>
            <string>TLSv1.0</string>
            <key>NSIncludesSubdomains</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### 2. Android 설정 (AndroidManifest.xml)

```xml
<application
    android:usesCleartextTraffic="true"
    android:networkSecurityConfig="@xml/network_security_config">
    
    <!-- 기존 설정들 -->
    
</application>

<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### 3. Android Network Security Config (res/xml/network_security_config.xml)

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">js.tosspayments.com</domain>
        <domain includeSubdomains="true">pay.toss.im</domain>
        <domain includeSubdomains="true">api.tosspayments.com</domain>
        <domain includeSubdomains="true">192.168.0.191</domain>
        <domain includeSubdomains="true">localhost</domain>
    </domain-config>
</network-security-config>
```

### 4. WebView 컴포넌트 설정

```javascript
import { WebView } from 'react-native-webview';

<WebView
    source={{ uri: 'http://192.168.0.191:3000/check-payment-toss' }}
    javaScriptEnabled={true}
    domStorageEnabled={true}
    startInLoadingState={true}
    scalesPageToFit={true}
    allowsInlineMediaPlayback={true}
    mediaPlaybackRequiresUserAction={false}
    mixedContentMode="compatibility"
    thirdPartyCookiesEnabled={true}
    sharedCookiesEnabled={true}
    allowsFullscreenVideo={true}
    allowFileAccess={true}
    allowUniversalAccessFromFileURLs={true}
    originWhitelist={['*']}
    onError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn('WebView error: ', nativeEvent);
    }}
    onHttpError={(syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        console.warn('WebView HTTP error: ', nativeEvent);
    }}
    onLoadStart={() => console.log('WebView load start')}
    onLoadEnd={() => console.log('WebView load end')}
    onLoadProgress={({ nativeEvent }) => console.log('WebView progress: ', nativeEvent.progress)}
/>
```

### 5. 문제 해결 체크리스트

1. **네트워크 연결 확인**
   - 개발 서버가 실행 중인지 확인
   - IP 주소로 접근 가능한지 확인

2. **CORS 설정 확인**
   - 브라우저 개발자 도구에서 CORS 오류 확인
   - 서버 응답 헤더 확인

3. **CSP 설정 확인**
   - Content-Security-Policy 헤더 확인
   - 토스 도메인이 허용되었는지 확인

4. **WebView 권한 확인**
   - JavaScript 실행 권한
   - 외부 도메인 접근 권한
   - 쿠키 및 로컬 스토리지 권한

### 6. 디버깅 방법

1. **Chrome DevTools 사용**
   - Android: `chrome://inspect`
   - iOS: Safari 개발자 도구

2. **로그 확인**
   - React Native 로그
   - WebView 콘솔 로그
   - 네트워크 요청 로그

3. **단계별 테스트**
   - 브라우저에서 직접 접근
   - 시뮬레이터/에뮬레이터에서 테스트
   - 실제 기기에서 테스트
