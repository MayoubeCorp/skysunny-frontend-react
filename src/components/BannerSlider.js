
import React, { useEffect, useRef, useState } from 'react';

export default function BannerSlider({
    banners = [],
    type = 'sub2', // sub2만 사용
    bannerHeight = 100,
    borderRadius = 0,
    showViewAll = false,
    onPressViewAll,
}) {
    const sliderRef = useRef(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    const ITEM_WIDTH = '100%';
    const imageHeight = bannerHeight;
    const imageBorder = borderRadius;

    // 무한루프를 위한 확장된 데이터 (배너가 2개 이상일 때만)
    const extendedBanners = banners.length > 1
        ? [banners[banners.length - 1], ...banners, banners[0]]
        : banners;

    // 자동 롤링 (3초 간격) - 배너가 2개 이상일 때만
    useEffect(() => {
        if (banners.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentIndex(prev => {
                const nextIndex = prev + 1;
                return nextIndex;
            });
        }, 3000);

        return () => {
            clearInterval(timer);
        };
    }, [banners.length]);

    // 무한루프 처리
    useEffect(() => {
        if (banners.length <= 1) return;

        // 마지막 복제된 배너(첫 번째 배너의 복사본)에 도달했을 때
        if (currentIndex >= extendedBanners.length - 1) {
            setTimeout(() => {
                setCurrentIndex(1); // 첫 번째 실제 배너로 점프 (애니메이션 없이)
            }, 300); // 애니메이션 완료 후
        }
        // 첫 번째 복제된 배너(마지막 배너의 복사본)에 도달했을 때
        else if (currentIndex <= 0) {
            setTimeout(() => {
                setCurrentIndex(banners.length); // 마지막 실제 배너로 점프 (애니메이션 없이)
            }, 300); // 애니메이션 완료 후
        }
    }, [currentIndex, banners.length, extendedBanners.length]);

    // 초기 위치 설정 (무한루프용)
    useEffect(() => {
        if (banners.length > 1) {
            setCurrentIndex(1); // 첫 번째 실제 배너로 설정
        }
    }, [banners.length]);

    // 배너 클릭 처리
    const handlePressBanner = (item) => {
        if (!item) return;

        const linkType = item.linkType; // external | internal
        const url = item.externalLinkUrl;
        const storeId = item.storeId;

        try {
            if (linkType === 'external' && url) {
                const safeUrl = url.startsWith('http') ? url : `https://${url}`;
                window.open(safeUrl, '_blank');
            } else if (linkType === 'internal') {
                if (url) {
                    // externalLinkUrl이 있는 경우
                    window.location.href = url;
                } else if (storeId) {
                    // storeId가 있는 경우 스토어 페이지로 이동
                    console.log(`스토어 ${storeId}로 이동`);
                    // 실제 스토어 페이지 라우팅 로직을 여기에 추가
                    // 예: window.location.href = `/store/${storeId}`;
                }
            }
        } catch (error) {
            console.error('배너 링크 오류:', error);
        }
    };

    const getImageSource = (item) => {
        return item?.thumbnailImageUrl || '';
    };

    if (!banners || banners.length === 0) return null;

    // 디버깅용 로그
    console.log('BannerSlider Debug:', {
        bannersLength: banners.length,
        extendedBannersLength: extendedBanners.length,
        currentIndex,
        banners: banners.map(b => ({ id: b.id, thumbnailImageUrl: b.thumbnailImageUrl }))
    });

    return (
        <div className="banner-slider" style={{ height: imageHeight, borderRadius: imageBorder }}>
            <div ref={sliderRef} className="slider-wrapper">
                {extendedBanners.map((item, index) => (
                    <div
                        key={`${item.id}-${index}`}
                        className="slider-item"
                        style={{
                            transform: banners.length > 1 ? `translateX(-${currentIndex * 100}%)` : 'translateX(0%)',
                        }}
                    >
                        <img
                            src={getImageSource(item)}
                            alt={`배너 ${index + 1}`}
                            onClick={() => handlePressBanner(item)}
                            onError={() => console.warn('배너 이미지 로딩 실패')}
                        />
                    </div>
                ))}
            </div>

            {/* 페이지 인디케이터 - 배너가 2개 이상일 때만 표시 */}
            {/* {banners.length > 1 && (
                <div className="page-indicator">
                    <div className="counter-btn">
                        <span className="page-text">
                            {Math.max(1, Math.min(currentIndex + 1, banners.length))} / {banners.length}
                        </span>
                    </div>
                </div>
            )} */}
        </div>
    );
}
