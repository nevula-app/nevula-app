export const NEVNOTE_COMING_SOON_POST_ID = '300bbdf4-b08b-4443-b294-a231da85c123';

/** Logo+suffix only on the post page (h1). List keeps plain title text. */
export function CommunityPostTitle({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const isNevNote = id === NEVNOTE_COMING_SOON_POST_ID;
  if (!isNevNote) {
    return <h1>{title}</h1>;
  }

  const suffix = title.replace(/^NevNote\s*/i, '').trim() || '– coming soon';

  return (
    <h1 className="communityPostTitleWithLogo">
      <img
        className="communityPostTitleLogo"
        src="/nevnote-badge-dark.svg"
        alt="NevNote"
        width={279}
        height={100}
      />
      <span className="communityPostTitleSuffix">{suffix}</span>
    </h1>
  );
}
