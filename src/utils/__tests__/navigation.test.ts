import { goBackOrReplaceRoot } from '../navigation';

describe('goBackOrReplaceRoot', () => {
  it('uses the existing navigation history when available', () => {
    const router = { canGoBack: jest.fn(() => true), back: jest.fn(), replace: jest.fn() };

    goBackOrReplaceRoot(router);

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('replaces a directly opened route with the library', () => {
    const router = { canGoBack: jest.fn(() => false), back: jest.fn(), replace: jest.fn() };

    goBackOrReplaceRoot(router);

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
