import './coming-soon.scss';

type TComingSoonProps = {
    title: string;
    description?: string;
};

const ComingSoon = ({ title, description }: TComingSoonProps) => (
    <div className='vx-coming-soon'>
        <span className='vx-coming-soon__badge'>Coming soon</span>
        <h2 className='vx-coming-soon__title'>{title}</h2>
        <p className='vx-coming-soon__desc'>
            {description ?? "We're building this out. Check back soon — or explore Bot Builder and Free Bots in the meantime."}
        </p>
    </div>
);

export default ComingSoon;
