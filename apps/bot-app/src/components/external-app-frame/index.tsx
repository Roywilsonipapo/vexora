import { useState } from 'react';
import './external-app-frame.scss';

type TExternalAppFrame = {
    src: string;
    title: string;
};

const ExternalAppFrame = ({ src, title }: TExternalAppFrame) => {
    const [is_loading, setIsLoading] = useState(true);

    return (
        <div className='vx-external-frame'>
            {is_loading && (
                <div className='vx-external-frame__loader'>
                    <span className='vx-external-frame__spinner' />
                    <span>Loading {title}…</span>
                </div>
            )}
            <iframe
                src={src}
                title={title}
                className='vx-external-frame__iframe'
                onLoad={() => setIsLoading(false)}
                allow='clipboard-write'
            />
        </div>
    );
};

export default ExternalAppFrame;
