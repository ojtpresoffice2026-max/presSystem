
import { useState } from 'react'
import { UserRound } from 'lucide-react'

type ProfileAvatarProps = {
  src?: string | null
  name?: string | null
  size?: number
  className?: string
}

export default function ProfileAvatar({
  src,
  name,
  size = 44,
  className = '',
}: ProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const initial = name?.trim().charAt(0).toUpperCase()

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 font-bold text-blue-800 ${className}`}
      style={{ width: size, height: size }}
    >
      {src && !imageFailed ? (
        <img
          src={src}
          alt={name ? `${name}'s profile picture` : 'Profile picture'}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initial ? (
        <span>{initial}</span>
      ) : (
        <UserRound size={Math.round(size * 0.5)} />
      )}
    </div>
  )
}
