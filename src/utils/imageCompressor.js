/**
 * 식판 사진 고효율 압축 최적화 (480px, 0.55 품질)
 * Firebase 무료 1GB 영구 유지를 위해 이미지 크기와 용량을 극소화합니다.
 */

export const COMPRESSION_CONFIG = {
  MAX_SIZE: 480, // 가로/세로 최대 480px
  QUALITY: 0.55, // JPEG 압축 품질 0.55 (20~45KB 수준 유지)
  MIME_TYPE: 'image/jpeg'
};

/**
 * 이미지 파일을 고효율로 압축하여 Base64 DataURL로 변환
 * @param {File|Blob} file 원본 이미지 파일
 * @param {Object} options 추가 옵션 (maxSize, quality)
 * @returns {Promise<{ dataUrl: string, originalSize: number, compressedSize: number }>}
 */
export function compressImage(file, options = {}) {
  const maxSize = options.maxSize || COMPRESSION_CONFIG.MAX_SIZE;
  const quality = options.quality || COMPRESSION_CONFIG.QUALITY;

  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('유효한 이미지 파일이 아닙니다.'));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 로드에 실패했습니다.'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // 가로/세로 비율 유지하며 최대 480px로 축소
          if (width > height) {
            if (width > maxSize) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }

          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('Canvas 컨텍스트를 생성할 수 없습니다.'));
          }

          // 이미지 렌더링 품질 설정
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // 흰색 배경 채우기 (투명 PNG 등이 검게 변하는 현상 방지)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 이미지 그리기
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // 0.55 품질 JPEG로 압축
          const dataUrl = canvas.toDataURL(COMPRESSION_CONFIG.MIME_TYPE, quality);

          // 대략적인 압축 후 용량 계산 (Base64 -> 바이트)
          const head = `data:${COMPRESSION_CONFIG.MIME_TYPE};base64,`;
          const base64Length = dataUrl.length - head.length;
          const compressedBytes = Math.round((base64Length * 3) / 4);

          resolve({
            dataUrl,
            originalSize: file.size,
            compressedSize: compressedBytes,
            width: canvas.width,
            height: canvas.height
          });
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
