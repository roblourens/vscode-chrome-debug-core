import { PromiseOrNot } from '../../utils/promises';

export interface IConfigurableFeature<Configuration> {
    install(configuration: Configuration): PromiseOrNot<void | this>;
}

export interface IConfigurationlessFeature {
    install(): PromiseOrNot<void | this>;
}

export type IFeature<Configuration = void> =
    Configuration extends void
    ? IConfigurationlessFeature
    : IConfigurableFeature<Configuration>;