interface BackRouter {
  canGoBack(): boolean;
  back(): void;
  replace(href: '/'): void;
}

export function goBackOrReplaceRoot(router: BackRouter) {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
