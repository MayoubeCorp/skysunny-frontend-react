import Axios from 'axios';
import config from '../config/config.js';

// util.format 대체 함수 (브라우저 환경용)
const formatString = (str, ...params) => {
    let result = str;
    params.forEach(param => {
        result = result.replace('%s', param);
    });
    return result;
};

const makeUrl = (url, params) => {
    let result = config.API_BASE_URL + url;
    if (params != null) {
        result = formatString(result, ...params);
    }
    console.log('url: ' + result);
    return result;
};

// 전역 로딩 카운터 초기화
if (typeof global !== 'undefined') {
    global.loadingCount = global.loadingCount || 0;
} else {
    window.loadingCount = window.loadingCount || 0;
}

const loadingStart = () => {
    const loadingCount = typeof global !== 'undefined' ? global.loadingCount : window.loadingCount;
    const newCount = loadingCount + 1;

    if (typeof global !== 'undefined') {
        global.loadingCount = newCount;
    } else {
        window.loadingCount = newCount;
    }

    if (newCount === 1) {
        // 로딩 UI 표시 로직 (필요시 구현)
        console.log('Loading started...');
    }
};

const loadingEnd = async () => {
    try {
        const loadingCount = typeof global !== 'undefined' ? global.loadingCount : window.loadingCount;
        if (loadingCount <= 1) {
            // 로딩 UI 숨김 로직 (필요시 구현)
            console.log('Loading ended...');
        }

        const newCount = Math.max(0, loadingCount - 1);
        if (typeof global !== 'undefined') {
            global.loadingCount = newCount;
        } else {
            window.loadingCount = newCount;
        }
    } catch (e) {
        console.error('Loading end error:', e);
    }
};

// ✅ 매 요청마다 토큰 불러와서 config 만들어주는 함수
const getRequestConfig = async () => {
    const token = localStorage.getItem('accessToken');
    return {
        withCredentials: true,
        timeout: 30000, // 30초 타임아웃
        headers: {
            Accept: 'application/json; charset=utf-8',
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            ...(token ? { Authorization: `Bearer ${token}` } : {}), // ✅ 토큰 있으면 추가
        },
    };
};

const httpGet = async (url, params, data, hideLoading) => {
    console.log("++++++++++++++httpGet=" + url, params, data);
    if (!hideLoading) loadingStart();

    try {
        const config = await getRequestConfig();
        const fullUrl = makeUrl(url, params);
        console.log("httpGet - Full URL:", fullUrl);
        console.log("httpGet - Config:", config);
        console.log("httpGet - Params:", data || {});

        const response = await Axios.get(fullUrl, {
            ...config,
            params: data || {}
        });
        if (!hideLoading) loadingEnd();
        console.log("httpGet - Response:", response.data);
        return response.data;
    } catch (error) {
        if (!hideLoading) loadingEnd();
        console.error("httpGet - Error details:", {
            message: error.message,
            code: error.code,
            response: error.response,
            request: error.request,
            config: error.config
        });
        return errorReject(hideLoading, null, url)(error);
    }
};

const httpPost = async (url, params, data, hideLoading) => {
    console.log('data: ' + JSON.stringify(data));
    if (!hideLoading) loadingStart();

    try {
        const config = await getRequestConfig();
        const response = await Axios.post(makeUrl(url, params), data, config);
        if (!hideLoading) loadingEnd();
        return response.data;
    } catch (error) {
        if (!hideLoading) loadingEnd();
        return errorReject(hideLoading, null, url)(error);
    }
};

const httpPut = async (url, params, data, hideLoading) => {
    console.log("++++++++++++++httpPut=" + url);
    if (!hideLoading) loadingStart();

    try {
        const config = await getRequestConfig();
        const response = await Axios.put(makeUrl(url, params), data, config);
        if (!hideLoading) loadingEnd();
        return response.data;
    } catch (error) {
        if (!hideLoading) loadingEnd();
        return errorReject(hideLoading, null, url)(error);
    }
};

const imageUrl = (idx) => {
    return `${config.API_BASE_URL}/file/${idx}`;
};

const serverUrl = config.API_BASE_URL;

const httpUrl = {
    qrCode: '/user/qr-code/%s',
    updateOrder: '/user/order/update',  // POST: 주문 정보 업데이트 (사용자, 좌석 등 추가 정보)
    usableCoupons: '/user/usable/coupons', // GET: 사용 가능한 쿠폰 조회 (쿼리 파라미터 사용)
};

export {
    httpGet,
    httpPost,
    httpPut,
    httpUrl,
    imageUrl,
    serverUrl
};

function errorReject(hideLoading, reject, url) {
    return error => {
        console.log('## http error: ' + url + " - " + JSON.stringify(error, null, 4));

        const status = error?.response?.status;
        const statusText = error?.response?.statusText;
        const responseData = error?.response?.data;
        const isNetworkError = error?.message === 'Network Error' || error?.code === 'NETWORK_ERROR' || error?.code === 'ERR_NETWORK';

        console.log('## 상세 오류 정보:', {
            status,
            statusText,
            responseData,
            url,
            message: error?.message,
            code: error?.code,
            isNetworkError,
            request: error?.request,
            config: error?.config
        });

        // Network Error 특별 처리
        if (isNetworkError) {
            console.error('## Network Error 상세 분석:', {
                url: url,
                fullUrl: makeUrl(url),
                hasResponse: !!error?.response,
                hasRequest: !!error?.request,
                message: error?.message,
                code: error?.code,
                stack: error?.stack
            });

            alert(`네트워크 연결 오류가 발생했습니다.\n\n확인사항:\n1. 인터넷 연결 상태\n2. 서버 상태 (${makeUrl(url)})\n3. CORS 설정\n4. 방화벽 설정\n\nURL: ${url}\n에러: ${error?.message}`);
        } else if (status === 401) {
            alert("장기간 미사용하여 자동 로그아웃 되었습니다! 다시 로그인해주세요.");
        } else if (status === 404) {
            alert(`API 엔드포인트를 찾을 수 없습니다.\nURL: ${url}\n상태: ${status} ${statusText}`);
        } else if (status >= 500) {
            alert(`서버 내부 오류가 발생했습니다.\nURL: ${url}\n상태: ${status} ${statusText}`);
        } else if (status === 400) {
            const errorMsg = responseData?.message || error?.message || '잘못된 요청입니다.';
            alert(`잘못된 요청입니다.\n${errorMsg}\nURL: ${url}\n상태: ${status}`);
        } else {
            const errorMsg = responseData?.message || error?.message || '알 수 없는 오류';
            alert(`서버 요청 오류\n${errorMsg}\nURL: ${url}\n상태: ${status || 'Unknown'}`);
        }

        if (reject) reject(error);
        throw error; // 호출한 쪽에서도 잡을 수 있게 던짐
    };
}
