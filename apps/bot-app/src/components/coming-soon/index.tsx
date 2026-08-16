import './coming-soon.scss';

type TComingSoon = {
    title: string;
};

const ComingSoon = ({ title }: TComingSoon) => (
    <div className='vx-coming-soon'>
        <div className='vx-coming-soon__badge'>Coming soon</div>
        <h2>{title}</h2>
        <p>This part of Vexora is still being built. Check back soon.</p>
    </div>
);

export default ComingSoon;
