// 환경별 API 설정
const config = {
  development: {
    API_BASE_URL: 'https://skysunny-api-dev.mayoube.co.kr',
    ENV: 'development'
  },
  staging: {
    API_BASE_URL: 'https://skysunny-api.mayoube.co.kr',
    ENV: 'staging'
  },
  production: {
    API_BASE_URL: 'https://skysunny-api.mayoube.co.kr',
    ENV: 'production'
  }
};

// 현재 환경 결정 로직
const getCurrentEnvironment = () => {
  // 1. 환경변수에서 REACT_APP_ENV를 먼저 확인
  if (process.env.REACT_APP_ENV) {
    return process.env.REACT_APP_ENV;
  }
  
  // 2. URL 기반으로 환경 판단 (배포된 환경에서)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.includes('dev') || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      return 'development';
    } else if (hostname.includes('staging') || hostname.includes('stg')) {
      return 'staging';
    }
  }
  
  // 3. NODE_ENV를 기반으로 환경 결정
  if (process.env.NODE_ENV === 'development') {
    return 'development';
  } else if (process.env.NODE_ENV === 'production') {
    // production 빌드에서는 기본적으로 staging을 사용
    // 실제 production 배포시에는 REACT_APP_ENV=production으로 설정하거나
    // 빌드 스크립트에서 환경을 지정
    return 'staging';
  }
  
  // 기본값은 development
  return 'development';
};

// 현재 환경의 설정 가져오기
const currentEnv = getCurrentEnvironment();
const currentConfig = {
  ...config[currentEnv] || config.development,
  // 환경변수에서 직접 API URL을 설정할 수 있도록 허용
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL || (config[currentEnv] || config.development).API_BASE_URL
};

console.log(`🌍 Current Environment: ${currentEnv}`);
console.log(`🔗 API Base URL: ${currentConfig.API_BASE_URL}`);

export default currentConfig;

// 환경별 설정 전체를 export (필요시 사용)
export { config };
