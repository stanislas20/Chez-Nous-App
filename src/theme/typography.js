import { css } from 'styled-components/native';

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
};

export const type = {
  h1: css`
    font-family: ${fontFamily.bold};
    font-size: 28px;
    line-height: 34px;
  `,
  h2: css`
    font-family: ${fontFamily.bold};
    font-size: 22px;
    line-height: 28px;
  `,
  h3: css`
    font-family: ${fontFamily.semiBold};
    font-size: 17px;
    line-height: 22px;
  `,
  body: css`
    font-family: ${fontFamily.regular};
    font-size: 15px;
    line-height: 21px;
  `,
  bodyMedium: css`
    font-family: ${fontFamily.medium};
    font-size: 15px;
    line-height: 21px;
  `,
  caption: css`
    font-family: ${fontFamily.regular};
    font-size: 13px;
    line-height: 18px;
  `,
  captionMedium: css`
    font-family: ${fontFamily.medium};
    font-size: 13px;
    line-height: 18px;
  `,
  button: css`
    font-family: ${fontFamily.semiBold};
    font-size: 15px;
    line-height: 20px;
  `,
};
